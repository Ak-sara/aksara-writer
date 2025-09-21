/**
 * Aksara Writer Preview Script for VS Code
 * Integrates with VS Code's native markdown preview like Marp
 */

interface VsCodeApi {
    postMessage(message: any): void;
    getState(): any;
    setState(state: any): void;
}

declare var acquireVsCodeApi: () => VsCodeApi;

// Check if we're in VS Code preview environment
if (typeof window !== 'undefined' && typeof acquireVsCodeApi !== 'undefined') {
    const vscode = acquireVsCodeApi();

    // Function to check if document has Aksara directives
    function hasAksaraDirectives(): boolean {
        const content = document.body.innerHTML;
        return content.includes('aksara:true') || content.includes('data-aksara');
    }

    // Function to check if document is presentation type
    function isPresentationType(): boolean {
        const content = document.body.innerHTML;
        return content.includes('type: presentation') || content.includes('type:presentation');
    }

    // Function to enhance the preview if Aksara directives are found
    function enhanceAksaraPreview(): void {
        if (!hasAksaraDirectives()) return;

        // Add Aksara styling to the preview
        const style = document.createElement('style');
        style.textContent = `
            /* Aksara Writer Preview Styles */
            body {
                font-family: 'Inter', 'Segoe UI', 'Noto Sans', sans-serif;
                line-height: 1.6;
                color: #2c3e50;
                max-width: 21cm;
                margin: 0 auto;
                padding: 2rem;
                background: white !important;
                zoom: var(--aksara-zoom, 1);
                transition: zoom 0.2s ease;
            }

            /* Force white background for dark mode */
            html, body {
                background: white !important;
                color: #2c3e50 !important;
            }

            /* Zoom controls */
            .aksara-zoom-controls {
                position: fixed;
                top: 10px;
                right: 10px;
                display: flex !important;
                gap: 5px;
                z-index: 999999 !important;
                background: rgba(255, 255, 255, 0.9);
                border-radius: 8px;
                padding: 5px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.15);
                backdrop-filter: blur(10px);
            }

            .aksara-zoom-btn {
                background: #667eea !important;
                color: white !important;
                border: none !important;
                padding: 0.5rem !important;
                border-radius: 4px !important;
                cursor: pointer !important;
                font-size: 0.8rem !important;
                width: 32px !important;
                height: 32px !important;
                display: flex !important;
                align-items: center !important;
                justify-content: center !important;
                box-shadow: 0 2px 8px rgba(0,0,0,0.2) !important;
                font-weight: bold !important;
                line-height: 1 !important;
            }

            .aksara-zoom-btn:hover {
                background: #5a6fd8 !important;
                transform: scale(1.05);
                transition: all 0.2s ease;
            }

            .aksara-zoom-btn:active {
                transform: scale(0.95);
            }

            /* Enhanced styling for presentation mode */
            body.presentation-mode .aksara-zoom-controls {
                top: 20px;
                right: 20px;
                background: rgba(0, 0, 0, 0.8);
            }

            body.presentation-mode .aksara-zoom-btn {
                background: #ffffff !important;
                color: #333 !important;
            }

            body.presentation-mode .aksara-zoom-btn:hover {
                background: #f0f0f0 !important;
            }

            /* Document sections */
            .aksara-section {
                background: white;
                padding: 2rem;
                margin: 2rem 0;
                border-radius: 8px;
                box-shadow: 0 4px 20px rgba(0,0,0,0.1);
                min-height: 29.7cm;
                page-break-after: always;
            }

            /* Aksara indicator */
            .aksara-indicator {
                position: fixed;
                top: 10px;
                right: 10px;
                background: #667eea;
                color: white;
                padding: 0.5rem 1rem;
                border-radius: 20px;
                font-size: 0.8rem;
                font-weight: 600;
                z-index: 1000;
                box-shadow: 0 2px 10px rgba(0,0,0,0.2);
            }

            /* Headers */
            h1 {
                color: #2c3e50;
                border-bottom: 3px solid #667eea;
                padding-bottom: 0.5rem;
            }
            h2 { color: #34495e; }
            h3 { color: #34495e; }

            /* Lists */
            li { margin: 0.5rem 0; }

            /* Code */
            code {
                background: #ecf0f1;
                padding: 0.2rem 0.4rem;
                border-radius: 3px;
                font-family: 'Fira Code', 'Consolas', monospace;
            }

            pre {
                background: #2c3e50;
                color: #ecf0f1;
                padding: 1rem;
                border-radius: 8px;
                overflow-x: auto;
            }

            /* Tables */
            table {
                width: 100%;
                border-collapse: collapse;
                margin: 1rem 0;
            }

            th, td {
                border: 1px solid #bdc3c7;
                padding: 0.75rem;
                text-align: left;
            }

            th {
                background: #34495e;
                color: white;
                font-weight: 600;
            }

            tr:nth-child(even) {
                background: #f8f9fa;
            }
        `;
        document.head.appendChild(style);

        // Detect document type and apply appropriate styling
        const isPresentation = isPresentationType();

        if (isPresentation) {
            document.body.classList.add('presentation-mode');
        }

        // Add Aksara indicator
        const indicator = document.createElement('div');
        indicator.className = 'aksara-indicator';
        indicator.textContent = isPresentation ? '📊 Aksara Presentation' : '📄 Aksara Writer';
        document.body.appendChild(indicator);

        // Add zoom controls (always visible for presentations, optional for documents)
        const shouldShowZoom = isPresentation || document.body.innerHTML.includes('zoom:true');
        if (shouldShowZoom || true) { // Show zoom for all Aksara documents
            const zoomControls = document.createElement('div');
            zoomControls.className = 'aksara-zoom-controls';
            zoomControls.innerHTML = `
                <button class="aksara-zoom-btn" onclick="adjustZoom(-0.1)" title="Zoom Out">−</button>
                <button class="aksara-zoom-btn" onclick="adjustZoom(0.1)" title="Zoom In">+</button>
                <button class="aksara-zoom-btn" onclick="resetZoom()" title="Reset Zoom">⌂</button>
            `;
            document.body.appendChild(zoomControls);

            console.log('🎯 Aksara zoom controls added for', isPresentation ? 'presentation' : 'document');
        }

        // Zoom functionality
        let currentZoom = 1;
        (window as any).adjustZoom = (delta: number) => {
            currentZoom = Math.max(0.5, Math.min(3, currentZoom + delta));
            document.documentElement.style.setProperty('--aksara-zoom', currentZoom.toString());
        };

        (window as any).resetZoom = () => {
            currentZoom = 1;
            document.documentElement.style.setProperty('--aksara-zoom', '1');
        };

        // Fix relative image paths using injected document directory
        const fixImagePaths = () => {
            const images = document.querySelectorAll('img');
            const docDir = (window as any).documentDir;

            images.forEach(img => {
                const src = img.getAttribute('src');
                if (src && !src.startsWith('http') && !src.startsWith('data:') && !src.startsWith('vscode-webview-resource:')) {
                    if (docDir) {
                        // Convert relative paths to webview resource URIs
                        if (src.startsWith('./')) {
                            img.src = `${docDir}/${src.substring(2)}`;
                        } else if (!src.startsWith('/')) {
                            img.src = `${docDir}/${src}`;
                        }
                    }
                }
            });
        };

        // Fix image paths initially and when new images are added
        fixImagePaths();

        // Remove fullscreen button from VS Code toolbar if it exists
        const removeFullscreenButton = () => {
            const toolbar = document.querySelector('.toolbar') || document.querySelector('[role="toolbar"]');
            if (toolbar) {
                const fullscreenBtn = toolbar.querySelector('[title*="fullscreen"], [title*="Fullscreen"]');
                if (fullscreenBtn) {
                    fullscreenBtn.remove();
                }
            }
        };

        // Remove fullscreen button
        setTimeout(removeFullscreenButton, 100);

        // Ensure zoom controls are visible (force re-add if missing)
        setTimeout(() => {
            const existingControls = document.querySelector('.aksara-zoom-controls');
            if (!existingControls && (isPresentation || true)) {
                const zoomControls = document.createElement('div');
                zoomControls.className = 'aksara-zoom-controls';
                zoomControls.innerHTML = `
                    <button class="aksara-zoom-btn" onclick="adjustZoom(-0.1)" title="Zoom Out">−</button>
                    <button class="aksara-zoom-btn" onclick="adjustZoom(0.1)" title="Zoom In">+</button>
                    <button class="aksara-zoom-btn" onclick="resetZoom()" title="Reset Zoom">⌂</button>
                `;
                document.body.appendChild(zoomControls);
                console.log('🔧 Zoom controls re-added after DOM update');
            }
        }, 200);

        // Process sections
        const content = document.body.innerHTML;
        if (content.includes('---')) {
            // Split content by horizontal rules
            const sections = content.split('<hr>');
            if (sections.length > 1) {
                document.body.innerHTML = sections.map((section, index) =>
                    `<div class="aksara-section" data-section="${index + 1}">${section}</div>`
                ).join('');
            }
        }

        console.log('🎯 Aksara Writer preview enhanced');
    }

    // Initialize when DOM is ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', enhanceAksaraPreview);
    } else {
        enhanceAksaraPreview();
    }

    // Re-enhance when content updates
    const observer = new MutationObserver((mutations) => {
        // Check if new images were added
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === Node.ELEMENT_NODE) {
                        const element = node as Element;
                        // Fix images in newly added content
                        const newImages = element.querySelectorAll ? element.querySelectorAll('img') : [];
                        if (newImages.length > 0) {
                            enhanceAksaraPreview();
                        }
                    }
                });
            }
        });
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
}