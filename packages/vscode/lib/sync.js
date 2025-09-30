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
}

// Hook into existing Aksara navigation functions
function initializeVSCodeSync() {
    // First, clean up any existing listeners
    cleanupSync();

    // Check if this is an Aksara document
    const hasAksara = document.body.innerHTML.includes('aksara') ||
                    document.querySelector('.document-section') ||
                    document.querySelector('.aksara-section');

    if (!hasAksara) {
        return;
    }

    // Store references to original navigation functions
    const originalNextSlide = window.nextSlide;
    const originalPreviousSlide = window.previousSlide;

    // Override navigation functions to notify VS Code
    if (typeof originalNextSlide === 'function') {
        window.nextSlide = function() {
            originalNextSlide.call(this);
            notifyEditorOfSlideChange();
        };
    }

    if (typeof originalPreviousSlide === 'function') {
        window.previousSlide = function() {
            originalPreviousSlide.call(this);
            notifyEditorOfSlideChange();
        };
    }

    // Detect if this is presentation mode (not scrollable)
    // Presentations have showSlide function or the body has limited scroll height
    const hasShowSlide = typeof window.showSlide === 'function';
    const hasNavFunctions = typeof window.nextSlide === 'function' && typeof window.previousSlide === 'function';
    const isScrollable = document.documentElement.scrollHeight > document.documentElement.clientHeight + 10;
    const isPresentationMode = hasShowSlide || (hasNavFunctions && !isScrollable);

    // Handle scroll events ONLY for document mode (not presentation)
    let lastScrollTime = 0;

    const scrollHandler = () => {
        // Skip scroll handling for presentation mode
        if (isPresentationMode) {
            return;
        }

        if (isUpdatingFromEditor || !document.hasFocus()) {
            return;
        }

        const now = Date.now();
        if (now - lastScrollTime < 100) {
            return;
        }

        if (window.aksaraSyncTimeout) {
            clearTimeout(window.aksaraSyncTimeout);
        }
        window.aksaraSyncTimeout = setTimeout(() => {
            const section = getCurrentSection();

            // Update slide counter for document mode
            updateSlideCounterForDocument(section);

            vscode.postMessage({
                type: 'preview-scroll',
                section: section
                // Don't send line - let editor calculate it from section
            });

            lastScrollTime = Date.now();
        }, 150);
    };

    const messageHandler = (event) => {
        const message = event.data;

        // Validate that the message is for the current document
        if (message.sourceFile && window.documentUri) {
            const currentFile = window.documentUri.split('/').pop();
            const messageFile = message.sourceFile.split('/').pop();
            if (currentFile !== messageFile) {
                return;
            }
        }

        if (message.type === 'cursor-moved' || message.type === 'scroll-changed') {
            handleEditorSync(message.line, message.section);
        }
    };

    // Register event listeners and track them for cleanup
    // Only register scroll handler for document mode
    if (!isPresentationMode) {
        window.addEventListener('scroll', scrollHandler);
        activeListeners.push(() => {
            window.removeEventListener('scroll', scrollHandler);
        });
    }

    window.addEventListener('message', messageHandler);
    activeListeners.push(() => {
        window.removeEventListener('message', messageHandler);
        if (window.aksaraSyncTimeout) {
            clearTimeout(window.aksaraSyncTimeout);
            window.aksaraSyncTimeout = null;
        }
    });

    // Initialize counters
    if (isPresentationMode) {
        // For presentation mode, update slide counter
        const initialSlide = getCurrentSlideIndex();
        updateSlideCounter(initialSlide);
    } else {
        // For document mode, update page counter
        const initialSection = getCurrentSection();
        updateSlideCounterForDocument(initialSection);
    }
}

function notifyEditorOfSlideChange() {
    if (isUpdatingFromEditor || !document.hasFocus()) {
        return;
    }

    const currentSection = getCurrentSlideIndex();
    vscode.postMessage({
        type: 'slide-changed',
        section: currentSection
    });
}

function getCurrentSlideIndex() {
    // Try to get current slide from global variable
    if (typeof window.currentSlide !== 'undefined') {
        return window.currentSlide;
    }

    // Fallback: find active slide
    const activeSlide = document.querySelector('.document-section.active, .slide.active');
    if (activeSlide) {
        const slides = document.querySelectorAll('.document-section, .slide');
        return Array.from(slides).indexOf(activeSlide);
    }

    return 0;
}

function getCurrentSection() {
    // For presentations, use the current slide index directly
    if (typeof window.currentSlide !== 'undefined') {
        return window.currentSlide;
    }

    // For documents: Calculate based on which section is most visible in viewport
    const sectionDivs = Array.from(document.querySelectorAll('.document-section'));

    if (sectionDivs.length > 0) {
        let maxVisibleArea = 0;
        let mostVisibleSection = 0;

        // Find which section has the most visible area in viewport
        for (let i = 0; i < sectionDivs.length; i++) {
            const section = sectionDivs[i];
            const rect = section.getBoundingClientRect();

            // Calculate visible area of this section in viewport
            const visibleTop = Math.max(0, rect.top);
            const visibleBottom = Math.min(window.innerHeight, rect.bottom);
            const visibleArea = Math.max(0, visibleBottom - visibleTop);

            if (visibleArea > maxVisibleArea) {
                maxVisibleArea = visibleArea;
                mostVisibleSection = i;
            }
        }

        return mostVisibleSection;
    }

    return 0;
}

function estimateLineFromScroll() {
    const scrollPercent = window.scrollY / (document.documentElement.scrollHeight - window.innerHeight);
    const averageLineHeight = 24;
    const totalLines = Math.ceil(document.body.scrollHeight / averageLineHeight);
    return Math.floor(scrollPercent * totalLines);
}

function handleEditorSync(line, section) {
    isUpdatingFromEditor = true;

    // Check if this is a presentation
    const hasShowSlide = typeof window.showSlide === 'function';
    const hasNavFunctions = typeof window.nextSlide === 'function' && typeof window.previousSlide === 'function';
    const isScrollable = document.documentElement.scrollHeight > document.documentElement.clientHeight + 10;
    const isPresentation = hasShowSlide || (hasNavFunctions && !isScrollable);

    if (isPresentation) {
        // Presentation mode: use slide navigation
        const totalSlides = document.querySelectorAll('.document-section').length;
        const clampedSection = Math.max(0, Math.min(section, totalSlides - 1));
        navigateToSlide(clampedSection);
    } else {
        // Document mode: scroll to section and update counter
        scrollToSection(section);
        updateSlideCounterForDocument(section);
    }

    setTimeout(() => {
        isUpdatingFromEditor = false;
    }, 200);
}

function navigateToSlide(targetSlide) {
    // Method 1: Direct showSlide function (most reliable)
    if (typeof window.showSlide === 'function') {
        window.showSlide(targetSlide);
        updateSlideCounter(targetSlide);
        return;
    }

    // Method 2: Set currentSlide and call showSlide
    if (typeof window.currentSlide !== 'undefined' && typeof window.showSlide === 'function') {
        window.currentSlide = targetSlide;
        window.showSlide(targetSlide);
        updateSlideCounter(targetSlide);
        return;
    }

    // Method 3: Use nextSlide/previousSlide to navigate step by step
    if (typeof window.nextSlide === 'function' && typeof window.previousSlide === 'function') {
        navigateWithStepFunctions(targetSlide);
        return;
    }

    // Method 4: Manual slide visibility control
    updateSlideVisibility(targetSlide);
    updateSlideCounter(targetSlide);
}

function navigateWithStepFunctions(targetSlide) {
    // Get current slide index
    let currentSlide = getCurrentSlideFromDOM();

    if (currentSlide === targetSlide) {
        updateSlideCounter(targetSlide);
        return;
    }

    // Calculate steps needed
    const stepsNeeded = Math.abs(targetSlide - currentSlide);
    let stepsTaken = 0;

    function stepToTarget() {
        const current = getCurrentSlideFromDOM();

        // Stop if we reached target or taken too many steps
        if (current === targetSlide || stepsTaken >= stepsNeeded + 5) {
            updateSlideCounter(targetSlide);
            return;
        }

        stepsTaken++;

        if (current < targetSlide) {
            window.nextSlide();
        } else if (current > targetSlide) {
            window.previousSlide();
        } else {
            // Already at target
            updateSlideCounter(targetSlide);
            return;
        }

        // Continue stepping with small delay
        setTimeout(stepToTarget, 100);
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
    }
}

function updateSlideCounterForDocument(currentSection) {
    // Get total sections from .document-section divs
    const sectionDivs = document.querySelectorAll('.document-section');
    const totalSections = sectionDivs.length || 1;

    // Find all page number elements and update them based on their position
    const allFooters = document.querySelectorAll('.document-footer');

    if (allFooters.length > 0) {
        // Update each footer's page number to match its actual position
        allFooters.forEach((footer, index) => {
            const pageNumberEl = footer.querySelector('.page-number');
            if (pageNumberEl) {
                const text = pageNumberEl.textContent || '';
                const pageMatch = text.match(/(Page|Halaman)\s+\d+\s*(of|dari|\/)\s*\d+/i);

                if (pageMatch) {
                    const prefix = pageMatch[1];
                    const separator = pageMatch[2];
                    // Each footer shows its own page number (index + 1)
                    const newText = `${prefix} ${index + 1} ${separator} ${totalSections}`;

                    if (pageNumberEl.textContent !== newText) {
                        pageNumberEl.textContent = newText;
                    }
                }
            }
        });
    }

    // Also update the #current-page indicator if it exists (in document controls)
    const currentPageEl = document.getElementById('current-page');
    if (currentPageEl) {
        const newPage = (currentSection + 1).toString();
        if (currentPageEl.textContent !== newPage) {
            currentPageEl.textContent = newPage;
        }
    }

    // Also update window.currentSlide if it exists (for compatibility)
    if (typeof window.currentSlide !== 'undefined') {
        window.currentSlide = currentSection;
    }
}

function updateSlideVisibility(targetSlide) {
    const slides = document.querySelectorAll('.document-section');

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
    const sectionDivs = Array.from(document.querySelectorAll('.document-section'));

    if (sectionDivs.length > 0) {
        const totalSections = sectionDivs.length;
        const clampedIndex = Math.max(0, Math.min(sectionIndex, totalSections - 1));

        const targetSection = sectionDivs[clampedIndex];
        if (targetSection) {
            // Scroll to make the section visible at top of viewport
            targetSection.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });

            // Update page counter after scroll
            setTimeout(() => {
                updateSlideCounterForDocument(clampedIndex);
            }, 100);
        }
    }
}

// Initialize with retry mechanism for Aksara functions
function tryInitializeSync() {
    // Check if document has Aksara content (always has .document-section)
    const hasAksaraContent = document.querySelector('.document-section') !== null;

    // Check if Aksara presentation functions are available (for presentations)
    const hasAksaraFunctions = typeof window.nextSlide === 'function' ||
                              typeof window.currentSlide !== 'undefined' ||
                              document.querySelectorAll('.document-section').length > 0;

    if (hasAksaraContent) {
        initializeVSCodeSync();
    } else if (hasAksaraFunctions) {
        setTimeout(tryInitializeSync, 500);
    }
}

// Clean up any global state from previous loads
if (window.aksaraInitialized) {
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