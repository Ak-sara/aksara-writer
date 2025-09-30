/**
 * Aksara Writer VS Code Sync Library
 * Handles bidirectional sync between editor and preview
 */

// VS Code API for sync communication
const vscode = acquireVsCodeApi();

// Sync state
let isUpdatingFromEditor = false;
let syncEnabled = true;
let activeListeners = [];

// Clean up any existing sync listeners
function cleanupSync() {
    console.log('🧹 Cleaning up previous sync listeners');
    activeListeners.forEach(cleanup => {
        if (typeof cleanup === 'function') {
            cleanup();
        }
    });
    activeListeners = [];

    // Clear any existing timeouts
    if (window.aksaraSyncTimeout) {
        clearTimeout(window.aksaraSyncTimeout);
        window.aksaraSyncTimeout = null;
    }

    // Reset sync state
    isUpdatingFromEditor = false;
    syncEnabled = true;

    console.log('✅ Sync cleanup completed');
}

// Hook into existing Aksara navigation functions
function initializeVSCodeSync() {
    console.log('🔧 Initializing VS Code sync...');

    // First, clean up any existing listeners
    cleanupSync();

    // Check if this is an Aksara document
    const hasAksara = document.body.innerHTML.includes('aksara') ||
                    document.querySelector('.document-section') ||
                    document.querySelector('.aksara-section');

    console.log('🔍 Document analysis:', {
        hasAksaraInHTML: document.body.innerHTML.includes('aksara'),
        hasDocumentSections: !!document.querySelector('.document-section'),
        hasAksaraSections: !!document.querySelector('.aksara-section'),
        totalSections: document.querySelectorAll('.document-section').length,
        isAksaraDoc: hasAksara
    });

    if (!hasAksara) {
        console.log('❌ Not an Aksara document, skipping sync');
        return;
    }

    // Store references to original navigation functions
    const originalNextSlide = window.nextSlide;
    const originalPreviousSlide = window.previousSlide;

    // Override navigation functions to notify VS Code
    if (typeof originalNextSlide === 'function') {
        window.nextSlide = function() {
            console.log('📤 nextSlide() called - notifying editor');
            originalNextSlide.call(this);
            notifyEditorOfSlideChange();
        };
    }

    if (typeof originalPreviousSlide === 'function') {
        window.previousSlide = function() {
            console.log('📤 previousSlide() called - notifying editor');
            originalPreviousSlide.call(this);
            notifyEditorOfSlideChange();
        };
    }

    // Handle scroll events for document mode - only when preview has focus
    let lastScrollTime = 0;

    const scrollHandler = () => {
        if (isUpdatingFromEditor) {
            console.log('🔒 Skipping scroll sync - updating from editor');
            return;
        }

        // Only sync if preview has focus or was recently interacted with
        if (!document.hasFocus()) {
            console.log('🔒 Skipping scroll sync - preview not focused');
            return;
        }

        const now = Date.now();
        if (now - lastScrollTime < 100) {
            console.log('🔒 Skipping scroll sync - debouncing');
            return;
        }

        if (window.aksaraSyncTimeout) {
            clearTimeout(window.aksaraSyncTimeout);
        }
        window.aksaraSyncTimeout = setTimeout(() => {
            const section = getCurrentSection();
            const line = estimateLineFromScroll();

            console.log('📤 Preview focused - scroll event notifying editor:', { section, line });

            // Update slide counter for document mode
            updateSlideCounterForDocument(section);

            vscode.postMessage({
                type: 'preview-scroll',
                section: section,
                line: line
            });

            lastScrollTime = Date.now();
        }, 150);
    };

    const messageHandler = (event) => {
        const message = event.data;
        console.log('📨 Message from editor:', message);

        // Validate that the message is for the current document
        if (message.sourceFile && window.documentUri) {
            const currentFile = window.documentUri.split('/').pop();
            const messageFile = message.sourceFile.split('/').pop();
            if (currentFile !== messageFile) {
                console.log('🔒 Ignoring message for different file:', messageFile, 'vs current:', currentFile);
                return;
            }
        }

        if (message.type === 'cursor-moved' || message.type === 'scroll-changed') {
            handleEditorSync(message.line, message.section);
        }
    };

    // Register event listeners and track them for cleanup
    window.addEventListener('scroll', scrollHandler);
    window.addEventListener('message', messageHandler);

    // Track cleanup functions
    activeListeners.push(() => {
        window.removeEventListener('scroll', scrollHandler);
        window.removeEventListener('message', messageHandler);
        if (window.aksaraSyncTimeout) {
            clearTimeout(window.aksaraSyncTimeout);
            window.aksaraSyncTimeout = null;
        }
    });

    console.log('✅ VS Code sync initialized with', activeListeners.length, 'tracked listeners');

    // Initialize slide counter for document mode
    const initialSection = getCurrentSection();
    updateSlideCounterForDocument(initialSection);
}

function notifyEditorOfSlideChange() {
    if (isUpdatingFromEditor) {
        console.log('🔒 Skipping slide notification - updating from editor');
        return;
    }

    // Only notify if preview has focus
    if (!document.hasFocus()) {
        console.log('🔒 Skipping slide notification - preview not focused');
        return;
    }

    const currentSection = getCurrentSlideIndex();
    console.log('📤 Preview focused - notifying editor of slide change:', currentSection);

    vscode.postMessage({
        type: 'slide-changed',
        section: currentSection
    });
}

function getCurrentSlideIndex() {
    // Try to get current slide from global variable
    if (typeof window.currentSlide !== 'undefined') {
        console.log('📊 Using window.currentSlide:', window.currentSlide);
        return window.currentSlide;
    }

    // Fallback: find active slide
    const activeSlide = document.querySelector('.document-section.active, .slide.active');
    if (activeSlide) {
        const slides = document.querySelectorAll('.document-section, .slide');
        const index = Array.from(slides).indexOf(activeSlide);
        console.log('📊 Found active slide at index:', index, 'of', slides.length, 'total slides');
        return index;
    }

    console.log('📊 No active slide found, returning 0');
    return 0;
}

function getCurrentSection() {
    // For presentations, use the current slide index directly
    if (typeof window.currentSlide !== 'undefined') {
        console.log('📊 Presentation mode - using currentSlide:', window.currentSlide);
        return window.currentSlide;
    }

    // For documents: calculate based on scroll position and HR elements
    console.log('📊 Document mode - calculating section from scroll position');

    // Get all HR elements (from --- separators in markdown)
    const hrElements = Array.from(document.querySelectorAll('hr'));
    console.log('📊 Found', hrElements.length, 'HR elements in document');

    if (hrElements.length === 0) {
        console.log('📊 No HR elements found, document has 1 section');
        return 0;
    }

    // The sections are: [content before first HR] [content between HRs] [content after last HR]
    // So for N HR elements, we have N+1 sections (0 to N)
    const totalSections = hrElements.length + 1;
    const scrollTop = window.scrollY + window.innerHeight / 3; // Use 1/3 for better detection

    let currentSection = 0;

    // Check each HR element to see if we've scrolled past it
    for (let i = 0; i < hrElements.length; i++) {
        const hr = hrElements[i];
        const rect = hr.getBoundingClientRect();
        const hrTop = rect.top + window.scrollY;

        if (scrollTop > hrTop) {
            currentSection = i + 1;
        } else {
            break;
        }
    }

    // Clamp to valid range
    currentSection = Math.max(0, Math.min(currentSection, totalSections - 1));

    console.log('📊 Document section calculation:', {
        scrollTop,
        totalSections,
        currentSection,
        hrPositions: hrElements.map(hr => hr.getBoundingClientRect().top + window.scrollY)
    });

    return currentSection;
}

function estimateLineFromScroll() {
    const scrollPercent = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
    const averageLineHeight = 24;
    const totalLines = Math.ceil(document.body.scrollHeight / averageLineHeight);
    return Math.floor(scrollPercent * totalLines);
}

function handleEditorSync(line, section) {
    console.log('🔄 Handling editor sync:', { line, section });
    console.log('🔍 Available globals:', {
        currentSlide: typeof window.currentSlide,
        showSlide: typeof window.showSlide,
        nextSlide: typeof window.nextSlide,
        previousSlide: typeof window.previousSlide
    });

    isUpdatingFromEditor = true;

    // Check if this is a presentation (has navigation functions or document sections)
    const hasNavFunctions = typeof window.nextSlide === 'function' || typeof window.previousSlide === 'function';
    const hasDocumentSections = document.querySelectorAll('.document-section').length > 0;
    const isPresentation = hasNavFunctions || hasDocumentSections;

    if (isPresentation) {
        // Get total slides and clamp section to valid range
        const totalSlides = document.querySelectorAll('.document-section').length;
        const clampedSection = Math.max(0, Math.min(section, totalSlides - 1));

        console.log('🎯 Presentation mode detected - navigating to slide:', clampedSection, 'of', totalSlides, '(requested:', section, ')');

        // Navigate to the target slide using available methods
        navigateToSlide(clampedSection);

    } else {
        // For document mode: scroll to position
        console.log('📄 Document mode - scrolling to section:', section);
        scrollToSection(section);
        // Update slide counter for document mode
        updateSlideCounterForDocument(section);
    }

    setTimeout(() => {
        isUpdatingFromEditor = false;
        console.log('🔓 Editor sync lock released');
    }, 500);
}

function navigateToSlide(targetSlide) {
    console.log('🎯 Navigating to slide:', targetSlide);

    // Method 1: Use currentSlide + showSlide if available
    if (typeof window.currentSlide !== 'undefined' && typeof window.showSlide === 'function') {
        console.log('📞 Method 1: Using currentSlide + showSlide');
        window.currentSlide = targetSlide;
        window.showSlide(targetSlide);
        updateSlideCounter(targetSlide);
        return;
    }

    // Method 2: Use nextSlide/previousSlide to navigate step by step
    if (typeof window.nextSlide === 'function' && typeof window.previousSlide === 'function') {
        console.log('📞 Method 2: Using nextSlide/previousSlide navigation');
        navigateWithStepFunctions(targetSlide);
        return;
    }

    // Method 3: Manual slide visibility control
    console.log('📞 Method 3: Manual slide visibility update');
    updateSlideVisibility(targetSlide);
    updateSlideCounter(targetSlide);
}

function navigateWithStepFunctions(targetSlide) {
    // Get current slide index
    let currentSlide = getCurrentSlideFromDOM();
    console.log('🎯 Current slide:', currentSlide, 'Target slide:', targetSlide);

    if (currentSlide === targetSlide) {
        console.log('✅ Already on target slide');
        return;
    }

    // Navigate step by step to target slide
    const steps = targetSlide - currentSlide;
    console.log('🎯 Need to move', steps, 'steps');

    function stepToTarget() {
        const current = getCurrentSlideFromDOM();
        if (current === targetSlide) {
            console.log('✅ Reached target slide:', targetSlide);
            updateSlideCounter(targetSlide);
            return;
        }

        if (current < targetSlide) {
            console.log('➡️ Next slide (', current, '→', current + 1, ')');
            window.nextSlide();
        } else {
            console.log('⬅️ Previous slide (', current, '→', current - 1, ')');
            window.previousSlide();
        }

        // Continue stepping with small delay
        setTimeout(stepToTarget, 50);
    }

    stepToTarget();
}

function getCurrentSlideFromDOM() {
    // Try to get from global variable first
    if (typeof window.currentSlide !== 'undefined') {
        return window.currentSlide;
    }

    // Find active slide
    const activeSlide = document.querySelector('.document-section.active, .slide.active');
    if (activeSlide) {
        const slides = document.querySelectorAll('.document-section, .slide');
        return Array.from(slides).indexOf(activeSlide);
    }

    // Fallback: look for visible slide
    const slides = document.querySelectorAll('.document-section');
    for (let i = 0; i < slides.length; i++) {
        const style = window.getComputedStyle(slides[i]);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
            return i;
        }
    }

    return 0;
}

function updateSlideCounter(slideIndex) {
    const counter = document.getElementById('current-slide');
    if (counter) {
        counter.textContent = (slideIndex + 1).toString();
        console.log('📊 Updated slide counter to:', slideIndex + 1);
    }
}

function updateSlideCounterForDocument(currentSection) {
    console.log('📊 Updating document slide counter for section:', currentSection);

    // Calculate total sections based on HR elements (same logic as getCurrentSection)
    const hrElements = document.querySelectorAll('hr');
    const totalSections = hrElements.length + 1; // N HR elements = N+1 sections

    console.log('📊 Counter update:', {
        currentSection: currentSection + 1,
        totalSections,
        hrCount: hrElements.length
    });

    // Look for any element containing slide numbers
    const allElements = document.querySelectorAll('*');
    let foundElements = 0;

    allElements.forEach(element => {
        const text = element.textContent || '';
        // Look for patterns like "1 of 5", "Page 1/5", etc.
        if (text.match(/\b\d+\s*(of|\/)\s*\d+\b/)) {
            foundElements++;
            console.log('📊 Found counter element:', element.tagName, element.className, 'text:', text);
            const newText = text.replace(/\b\d+(\s*(?:of|\/)\s*)\d+\b/, (currentSection + 1) + '$1' + totalSections);
            if (newText !== text) {
                element.textContent = newText;
                console.log('📊 Updated slide counter via pattern match:', text, '->', newText);
            }
        }
    });

    console.log('📊 Found and updated', foundElements, 'counter elements');

    // Also update window.currentSlide if it exists (for compatibility)
    if (typeof window.currentSlide !== 'undefined') {
        window.currentSlide = currentSection;
        console.log('📊 Updated window.currentSlide to:', currentSection);
    }
}

function updateSlideVisibility(targetSlide) {
    const slides = document.querySelectorAll('.document-section');
    console.log('🎞️ Manually updating slide visibility - target:', targetSlide, 'total slides:', slides.length);

    slides.forEach((slide, index) => {
        slide.style.display = index === targetSlide ? 'block' : 'none';
        if (index === targetSlide) {
            slide.classList.add('active');
        } else {
            slide.classList.remove('active');
        }
    });
}

function scrollToSection(sectionIndex) {
    console.log('📄 Document scrollToSection called for index:', sectionIndex);

    // Get HR elements (same logic as getCurrentSection)
    const hrElements = Array.from(document.querySelectorAll('hr'));
    const totalSections = hrElements.length + 1;

    console.log('📄 Scroll to section:', {
        sectionIndex,
        totalSections,
        hrCount: hrElements.length
    });

    // Clamp section index to valid range
    const clampedIndex = Math.max(0, Math.min(sectionIndex, totalSections - 1));

    if (clampedIndex === 0) {
        // Section 0: scroll to top of document
        console.log('📄 Scrolling to section 0 (top of document)');
        window.scrollTo({ top: 0, behavior: 'smooth' });
    } else if (clampedIndex <= hrElements.length) {
        // Section N: scroll to HR element N-1
        const targetHr = hrElements[clampedIndex - 1];
        if (targetHr) {
            console.log('📄 Scrolling to HR element', clampedIndex - 1, 'for section', clampedIndex);
            targetHr.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        } else {
            console.log('📄 HR element not found, using fallback scroll');
            const percentage = clampedIndex / totalSections;
            const scrollY = percentage * (document.documentElement.scrollHeight - window.innerHeight);
            window.scrollTo({ top: scrollY, behavior: 'smooth' });
        }
    } else {
        // Fallback for out-of-range sections
        console.log('📄 Section out of range, scrolling to end');
        window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: 'smooth'
        });
    }
}

// Initialize with retry mechanism for Aksara functions
function tryInitializeSync() {
    console.log('⏰ Attempting sync initialization...');

    // Check if document has Aksara content
    const hasAksaraContent = document.body.innerHTML.includes('aksara') ||
                           document.querySelector('.document-section') ||
                           document.querySelector('.aksara-section') ||
                           document.querySelectorAll('hr').length > 0 ||
                           document.querySelectorAll('h1').length > 0;

    // Check if Aksara presentation functions are available (for presentations)
    const hasAksaraFunctions = typeof window.nextSlide === 'function' ||
                              typeof window.currentSlide !== 'undefined' ||
                              document.querySelectorAll('.document-section').length > 0;

    if (hasAksaraContent) {
        console.log('✅ Aksara content detected, initializing sync');
        initializeVSCodeSync();
    } else if (hasAksaraFunctions) {
        console.log('⏳ Aksara functions detected but no content yet, retrying in 500ms...');
        setTimeout(tryInitializeSync, 500);
    } else {
        console.log('❌ No Aksara content detected, skipping sync initialization');
    }
}

// Clean up any global state from previous loads
if (window.aksaraInitialized) {
    console.log('🔄 Previous Aksara instance detected, cleaning up...');
    cleanupSync();
}
window.aksaraInitialized = true;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(tryInitializeSync, 100);
    });
} else {
    setTimeout(tryInitializeSync, 100);
}