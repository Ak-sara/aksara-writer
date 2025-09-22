// Aksara Writer Interactive Scripts
function initializeAksaraDocument(totalSections) {
    let currentSlide = 0;
    let currentZoom = 1;
    const totalSlides = totalSections;
    const isPresentation = document.body.dataset.type === 'presentation';
    let controlsVisible = false;
    let hideTimeout;

// Initialize based on document type
document.addEventListener('DOMContentLoaded', function() {
  if (isPresentation) {
    initializePresentation();
  } else {
    initializeDocument();
  }

  setupControls();
  setupKeyboardNavigation();
});

function initializePresentation() {
  const sections = document.querySelectorAll('.document-section');
  sections.forEach((section, index) => {
    if (index === 0) {
      section.classList.add('active');
    } else if (index === 1) {
      section.classList.add('next');
    }
  });
  updateSlideIndicator();
}

function initializeDocument() {
  // Document mode initialization
  // Set initial page to 1 before calculating from scroll position
  const pageIndicator = document.getElementById('current-page');
  if (pageIndicator) {
    pageIndicator.textContent = '1';
  }
  // Then update based on scroll position after a brief delay
  setTimeout(updatePageIndicator, 100);
}

function setupControls() {
  const controls = document.querySelector('.presentation-controls, .document-controls');
  if (!controls) return;

  // Show controls on mouse move
  document.addEventListener('mousemove', showControls);
  document.addEventListener('keydown', showControls);

  // Hide controls after inactivity
  function showControls() {
    controls.classList.add('visible');
    controlsVisible = true;

    clearTimeout(hideTimeout);
    hideTimeout = setTimeout(() => {
      controls.classList.remove('visible');
      controlsVisible = false;
    }, 3000);
  }

  // Keep controls visible on hover
  controls.addEventListener('mouseenter', () => {
    clearTimeout(hideTimeout);
  });

  controls.addEventListener('mouseleave', () => {
    if (controlsVisible) {
      hideTimeout = setTimeout(() => {
        controls.classList.remove('visible');
        controlsVisible = false;
      }, 1000);
    }
  });
}

function setupKeyboardNavigation() {
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch(e.key) {
      case 'ArrowRight':
      case ' ':
      case 'PageDown':
        e.preventDefault();
        if (isPresentation) {
          nextSlide();
        } else {
          nextPage();
        }
        break;
      case 'ArrowLeft':
      case 'PageUp':
        e.preventDefault();
        if (isPresentation) {
          previousSlide();
        } else {
          previousPage();
        }
        break;
      case 'Home':
        e.preventDefault();
        if (isPresentation) {
          goToSlide(0);
        } else {
          goToPage(1);
        }
        break;
      case 'End':
        e.preventDefault();
        if (isPresentation) {
          goToSlide(totalSlides - 1);
        } else {
          goToPage(totalSlides);
        }
        break;
      case 'f':
      case 'F11':
        e.preventDefault();
        toggleFullscreen();
        break;
      case '=':
      case '+':
        e.preventDefault();
        zoomIn();
        break;
      case '-':
        e.preventDefault();
        zoomOut();
        break;
      case '0':
        e.preventDefault();
        fitWidth();
        break;
    }
  });
}

// Presentation Navigation
function nextSlide() {
  if (currentSlide < totalSlides - 1) {
    currentSlide++;
    updateSlides();
    updateSlideIndicator();
  }
}

function previousSlide() {
  if (currentSlide > 0) {
    currentSlide--;
    updateSlides();
    updateSlideIndicator();
  }
}

function goToSlide(index) {
  if (index >= 0 && index < totalSlides) {
    currentSlide = index;
    updateSlides();
    updateSlideIndicator();
  }
}

function updateSlides() {
  const sections = document.querySelectorAll('.document-section');

  sections.forEach((section, index) => {
    section.classList.remove('active', 'prev', 'next');

    if (index === currentSlide) {
      section.classList.add('active');
    } else if (index === currentSlide - 1) {
      section.classList.add('prev');
    } else if (index === currentSlide + 1) {
      section.classList.add('next');
    }
  });
}

function updateSlideIndicator() {
  const indicator = document.getElementById('current-slide');
  if (indicator) {
    indicator.textContent = (currentSlide + 1).toString();
  }
}

// Document Navigation
function nextPage() {
  const sections = document.querySelectorAll('.document-section');
  if (currentSlide < sections.length - 1) {
    currentSlide++;
    sections[currentSlide].scrollIntoView({ behavior: 'smooth' });
    updatePageIndicator();
  }
}

function previousPage() {
  const sections = document.querySelectorAll('.document-section');
  if (currentSlide > 0) {
    currentSlide--;
    sections[currentSlide].scrollIntoView({ behavior: 'smooth' });
    updatePageIndicator();
  }
}

function goToPage(pageNumber) {
  const sections = document.querySelectorAll('.document-section');
  const index = pageNumber - 1;
  if (index >= 0 && index < sections.length) {
    currentSlide = index;
    sections[currentSlide].scrollIntoView({ behavior: 'smooth' });
    updatePageIndicator();
  }
}

function updatePageIndicator() {
  const sections = document.querySelectorAll('.document-section');
  const scrollTop = window.pageYOffset;
  let currentPage = 1;

  sections.forEach((section, index) => {
    const rect = section.getBoundingClientRect();
    if (rect.top <= window.innerHeight / 2 && rect.bottom >= window.innerHeight / 2) {
      currentPage = index + 1;
    }
  });

  currentSlide = currentPage - 1;

  // Update the appropriate indicator based on document type
  const slideIndicator = document.getElementById('current-slide');
  const pageIndicator = document.getElementById('current-page');

  if (slideIndicator) {
    slideIndicator.textContent = currentPage.toString();
  }
  if (pageIndicator) {
    pageIndicator.textContent = currentPage.toString();
  }
}

// Zoom Functions
function zoomIn() {
  currentZoom = Math.min(3, currentZoom + 0.1);
  updateZoom();
}

function zoomOut() {
  currentZoom = Math.max(0.5, currentZoom - 0.1);
  updateZoom();
}

function fitWidth() {
  currentZoom = 1;
  updateZoom();
}

function updateZoom() {
  if (isPresentation) {
    document.querySelector('.aksara-document').style.transform =
      `translate(-50%, -50%) scale(${currentZoom})`;
  } else {
    document.querySelector('.aksara-document').style.transform = `scale(${currentZoom})`;
  }
}

// Fullscreen
function toggleFullscreen() {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(err => {
      console.log(`Error attempting to enable fullscreen: ${err.message}`);
    });
  } else {
    document.exitFullscreen();
  }
}

// Auto-hide controls in fullscreen
document.addEventListener('fullscreenchange', () => {
  const controls = document.querySelector('.presentation-controls, .document-controls');
  if (document.fullscreenElement) {
    controls?.classList.add('fullscreen-mode');
  } else {
    controls?.classList.remove('fullscreen-mode');
  }
});

// Initialize on load
function initializeAksara() {
  const isPresentation = document.body.dataset.type === 'presentation';

  if (isPresentation) {
    // Presentation mode: ensure slide indicator shows 1
    const slideIndicator = document.getElementById('current-slide');
    if (slideIndicator) {
      slideIndicator.textContent = '1';
    }
    currentSlide = 0;
    updateSlideIndicator();
  } else {
    // Document mode: ensure page indicator shows 1
    const pageIndicator = document.getElementById('current-page');
    if (pageIndicator) {
      pageIndicator.textContent = '1';
    }
    setTimeout(updatePageIndicator, 100);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeAksara);
} else {
  initializeAksara();
}

// End of initializeAksaraDocument function
}