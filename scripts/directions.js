// Directions page interactive/UI logic - OPTIMIZED

document.addEventListener('DOMContentLoaded', function () {
    // Cache DOM elements once
    const fadeContent = document.querySelector('.fade-content');
    const cursorFollower = document.querySelector('.cursor-follower');
    const paperBg = document.querySelector('.paper-background');
    const tocSidebar = document.getElementById('tocSidebar');
    const headerTrigger = document.getElementById('headerTrigger');
    const modernSidebar = document.getElementById('modernSidebar');
    const navLabel = document.getElementById('navLabel');
    const navItems = document.querySelectorAll('.sidebar-nav-item');
    const burgerMenuBtn = document.getElementById('burgerMenuBtn');
    const mobileMenuOverlay = document.getElementById('mobileMenuOverlay');
    const mobileMenuPanel = document.getElementById('mobileMenuPanel');
    const mobileNavItems = document.querySelectorAll('.mobile-nav-item');
    
    // Initialize Lucide Icons once
    if (window.lucide) {
        lucide.createIcons();
    }
    
    // Fade-in content
    if (fadeContent) {
        requestAnimationFrame(() => fadeContent.classList.add('is-visible'));
    }
    
    // ===========================
    // OPTIMIZED CURSOR FOLLOWER (Desktop Only) - Only runs when mouse moves
    // ===========================
    if (cursorFollower && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
        let mouseX = 0, mouseY = 0;
        let followerX = 0, followerY = 0;
        let rafId = null;
        let lastUpdate = 0;
        let frameCounter = 0;
        let isAnimating = false;
        const THROTTLE_MS = 16; // ~60fps
        const PAPER_UPDATE_INTERVAL = 3; // Update paper bg every 3 frames
        
        // Throttled mouse move handler - only starts animation if not already running
        const handleMouseMove = (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
            
            if (!isAnimating) {
                isAnimating = true;
                cursorFollower.style.opacity = '1';
                animateCursor();
            }
        };
        
        document.addEventListener('mousemove', handleMouseMove, { passive: true });
        
        function animateCursor() {
            const now = performance.now();
            
            // Throttle to ~60fps
            if (now - lastUpdate < THROTTLE_MS) {
                rafId = requestAnimationFrame(animateCursor);
                return;
            }
            
            lastUpdate = now;
            frameCounter++;
            
            const dx = mouseX - followerX;
            const dy = mouseY - followerY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            // Only animate if movement is significant (>0.5px)
            if (distance > 0.5) {
                followerX += dx * 0.1;
                followerY += dy * 0.1;
                cursorFollower.style.transform = `translate(${followerX}px, ${followerY}px) translate(-50%, -50%)`;
                
                // Paper background updates less frequently
                if (paperBg && frameCounter % PAPER_UPDATE_INTERVAL === 0) {
                    const offsetX = (followerX / window.innerWidth - 0.5) * 20;
                    const offsetY = (followerY / window.innerHeight - 0.5) * 20;
                    paperBg.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
                }
                
                rafId = requestAnimationFrame(animateCursor);
            } else {
                // Stop animation when movement is minimal
                isAnimating = false;
                rafId = null;
            }
        }
        
        document.addEventListener('mouseleave', () => {
            isAnimating = false;
            cursorFollower.style.opacity = '0';
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
            }
        }, { passive: true });
        
        document.addEventListener('mouseenter', () => {
            // Don't restart animation on enter, wait for mouse move
        }, { passive: true });
    }
    // ===========================
    // HEADER TRIGGER & SIDEBAR
    // ===========================
    let headerExpanded = false;
    
    if (headerTrigger && modernSidebar) {
        headerTrigger.addEventListener('click', () => {
            headerExpanded = !headerExpanded;
            if (headerExpanded) {
                modernSidebar.classList.remove('header-collapsed');
                modernSidebar.classList.add('header-expanded');
                headerTrigger.classList.add('header-expanded', 'trigger-expanded');
            } else {
                modernSidebar.classList.remove('header-expanded');
                modernSidebar.classList.add('header-collapsed');
                headerTrigger.classList.remove('header-expanded', 'trigger-expanded');
            }
        }, { passive: false });
    }
    
    // Nav item hover tooltips (Desktop only) - Use event delegation for better performance
    if (navLabel && navItems.length > 0 && window.matchMedia('(min-width: 768px)').matches) {
        const handleNavEnter = (e) => {
            const label = e.currentTarget.getAttribute('data-label');
            if (label) {
                navLabel.textContent = label;
                navLabel.classList.add('visible');
            }
        };
        const handleNavLeave = () => {
            navLabel.classList.remove('visible');
        };
        
        navItems.forEach(item => {
            item.addEventListener('mouseenter', handleNavEnter, { passive: true });
            item.addEventListener('mouseleave', handleNavLeave, { passive: true });
        });
    }
    
    // ===========================
    // MOBILE BURGER MENU
    // ===========================
    let mobileMenuOpen = false;
    
    function toggleMobileMenu() {
        mobileMenuOpen = !mobileMenuOpen;
        if (mobileMenuOpen) {
            burgerMenuBtn?.classList.add('active');
            mobileMenuOverlay?.classList.add('active');
            mobileMenuPanel?.classList.add('active');
            document.body.style.overflow = 'hidden';
        } else {
            burgerMenuBtn?.classList.remove('active');
            mobileMenuOverlay?.classList.remove('active');
            mobileMenuPanel?.classList.remove('active');
            document.body.style.overflow = '';
        }
    }
    
    if (burgerMenuBtn) {
        burgerMenuBtn.addEventListener('click', toggleMobileMenu, { passive: false });
    }
    if (mobileMenuOverlay) {
        mobileMenuOverlay.addEventListener('click', toggleMobileMenu, { passive: false });
    }
    
    // Close menu when clicking a nav item
    mobileNavItems.forEach(item => {
        item.addEventListener('click', () => {
            if (mobileMenuOpen) {
                toggleMobileMenu();
            }
        }, { passive: false });
    });
    // Smooth scroll for anchor links - Use event delegation for better performance
    const handleAnchorClick = (e) => {
        const href = e.currentTarget.getAttribute('href');
        if (href && href !== '#' && href.startsWith('#')) {
            e.preventDefault();
            const target = document.querySelector(href);
            if (target) {
                const offset = 120; // Fixed header
                const targetPosition = target.getBoundingClientRect().top + window.pageYOffset - offset;
                window.scrollTo({ top: targetPosition, behavior: 'smooth' });
                
                // Update active TOC link
                const tocLinks = document.querySelectorAll('.toc-list a');
                tocLinks.forEach(link => {
                    link.classList.remove('active');
                    if (link.getAttribute('href') === href) {
                        link.classList.add('active');
                    }
                });
            }
        }
    };
    
    // Use event delegation on document for better performance
    document.addEventListener('click', (e) => {
        const anchor = e.target.closest('a[href^="#"]');
        if (anchor) {
            handleAnchorClick.call(anchor, e);
        }
    }, { passive: false });
    
    // ===========================
    // OPTIMIZED TOC ACTIVE SECTION HIGHLIGHTING
    // ===========================
    // Use IntersectionObserver instead of scroll + getBoundingClientRect for better performance
    const sections = document.querySelectorAll('.guide-section[id]');
    const tocLinks = document.querySelectorAll('.toc-list a[data-section]');
    const tocLinksMap = new Map();
    
    // Cache toc links in a map for O(1) lookup
    tocLinks.forEach(link => {
        const section = link.getAttribute('data-section');
        tocLinksMap.set(section, link);
    });
    
    // IntersectionObserver for active section detection (much more performant)
    if (sections.length > 0 && 'IntersectionObserver' in window) {
        const observerOptions = {
            root: null,
            rootMargin: '-100px 0px -50% 0px', // Trigger when section is ~100px from top
            threshold: [0, 0.1, 0.5]
        };
        
        let currentActive = '';
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && entry.intersectionRatio > 0.1) {
                    const sectionId = entry.target.getAttribute('id');
                    if (sectionId && sectionId !== currentActive) {
                        // Remove previous active
                        if (currentActive && tocLinksMap.has(currentActive)) {
                            tocLinksMap.get(currentActive).classList.remove('active');
                        }
                        // Add new active
                        if (tocLinksMap.has(sectionId)) {
                            tocLinksMap.get(sectionId).classList.add('active');
                            currentActive = sectionId;
                        }
                    }
                }
            });
        }, observerOptions);
        
        // Observe all sections
        sections.forEach(section => observer.observe(section));
        
        // Fallback: set first section as active initially if none is intersecting
        if (sections.length > 0) {
            const firstSection = sections[0].getAttribute('id');
            if (firstSection && tocLinksMap.has(firstSection)) {
                setTimeout(() => {
                    if (!currentActive) {
                        tocLinksMap.get(firstSection).classList.add('active');
                        currentActive = firstSection;
                    }
                }, 100);
            }
        }
    } else {
        // Fallback for older browsers: optimized scroll handler
        let ticking = false;
        let lastKnownScroll = 0;
        
        function updateActiveSection() {
            const scrollOffset = 150;
            let currentSection = '';
            const scrollY = window.pageYOffset || window.scrollY;
            
            sections.forEach(section => {
                const rect = section.getBoundingClientRect();
                const sectionTop = rect.top + scrollY;
                const sectionId = section.getAttribute('id');
                
                if (scrollY >= sectionTop - scrollOffset && scrollY < sectionTop + rect.height) {
                    currentSection = sectionId;
                }
            });
            
            if (currentSection && tocLinksMap.has(currentSection)) {
                tocLinks.forEach(link => link.classList.remove('active'));
                tocLinksMap.get(currentSection).classList.add('active');
            }
            
            ticking = false;
        }
        
        window.addEventListener('scroll', () => {
            lastKnownScroll = window.pageYOffset || window.scrollY;
            if (!ticking) {
                window.requestAnimationFrame(updateActiveSection);
                ticking = true;
            }
        }, { passive: true });
        
        // Initial update
        updateActiveSection();
    }
    
    // Icons already initialized at top, no need to re-initialize
});
