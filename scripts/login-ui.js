// login.html: UI effects for fade, icons, nav, cursor, burger

document.addEventListener('DOMContentLoaded', function() {
    // Initialize Lucide icons
    if (window.lucide) lucide.createIcons();
    // Fade in content
    setTimeout(() => {
        document.getElementById('fade-content')?.classList.add('is-visible');
    }, 100);
    // Subtle background spotlight that follows mouse
    const backgroundSpotlight = document.getElementById('background-spotlight');
    if (backgroundSpotlight) {
        let targetX = 50;
        let targetY = 50;
        let currentX = 50;
        let currentY = 50;
        
        function updateSpotlight() {
            // Smooth interpolation for natural movement
            currentX += (targetX - currentX) * 0.05;
            currentY += (targetY - currentY) * 0.05;
            
            backgroundSpotlight.style.setProperty('--spotlight-x', `${currentX}%`);
            backgroundSpotlight.style.setProperty('--spotlight-y', `${currentY}%`);
            
            requestAnimationFrame(updateSpotlight);
        }
        
        document.addEventListener('mousemove', (e) => {
            // Convert mouse position to percentage
            targetX = (e.clientX / window.innerWidth) * 100;
            targetY = (e.clientY / window.innerHeight) * 100;
        }, { passive: true });
        
        // Start animation loop
        updateSpotlight();
    }
    // Header trigger/peek menu logic
    const headerTrigger = document.getElementById('headerTrigger');
    const headerNav = document.getElementById('headerNav');
    let headerExpanded = false;
    headerTrigger.addEventListener('click', () => {
        headerExpanded = !headerExpanded;
        if (headerExpanded) {
            headerTrigger.classList.add('header-expanded', 'trigger-expanded');
            headerTrigger.classList.remove('trigger-collapsed');
            headerNav.classList.remove('header-collapsed', 'animating-out');
            headerNav.classList.add('header-expanded', 'animating-in');
        } else {
            headerTrigger.classList.remove('header-expanded', 'trigger-expanded');
            headerTrigger.classList.add('trigger-collapsed');
            headerNav.classList.remove('header-expanded', 'animating-in');
            headerNav.classList.add('header-collapsed', 'animating-out');
        }
    });
    // Mobile burger menu
    const burgerBtn = document.getElementById('burgerMenuBtn');
    const mobileOverlay = document.getElementById('mobileMenuOverlay');
    const mobilePanel = document.getElementById('mobileMenuPanel');
    burgerBtn.addEventListener('click', () => {
        burgerBtn.classList.toggle('active');
        mobileOverlay.classList.toggle('active');
        mobilePanel.classList.toggle('active');
    });
    mobileOverlay.addEventListener('click', () => {
        burgerBtn.classList.remove('active');
        mobileOverlay.classList.remove('active');
        mobilePanel.classList.remove('active');
    });
    // Navigation item hover labels
    const navItems = document.querySelectorAll('.sidebar-nav-item');
    const navLabel = document.getElementById('navLabel');
    navItems.forEach(item => {
        item.addEventListener('mouseenter', (e) => {
            const label = e.currentTarget.getAttribute('data-label');
            navLabel.textContent = label;
            navLabel.classList.add('visible');
        });
        item.addEventListener('mouseleave', () => {
            navLabel.classList.remove('visible');
        });
    });
    // Glassmorphic container glare effect
    const glassmorphicContainer = document.getElementById('glassmorphic-container');
    if (glassmorphicContainer) {
        let rafId = null;
        let isAnimating = false;
        let mouseX = 0;
        let mouseY = 0;
        let currentX = 50;
        let currentY = 50;
        let glareOpacity = 0;
        let targetGlareOpacity = 0;
        
        function updateGlare() {
            if (!glassmorphicContainer) return;
            
            const rect = glassmorphicContainer.getBoundingClientRect();
            const containerX = rect.left;
            const containerY = rect.top;
            const containerWidth = rect.width;
            const containerHeight = rect.height;
            
            if (containerWidth === 0 || containerHeight === 0) {
                // Container not yet laid out
                rafId = requestAnimationFrame(updateGlare);
                return;
            }
            
            const mouseRelativeX = mouseX - containerX;
            const mouseRelativeY = mouseY - containerY;
            
            // Check if mouse is inside or near the container (with 50px proximity threshold)
            const isNearContainer = mouseX >= containerX - 50 && 
                                   mouseX <= containerX + containerWidth + 50 &&
                                   mouseY >= containerY - 50 && 
                                   mouseY <= containerY + containerHeight + 50;
            
            if (isNearContainer) {
                // Calculate position relative to container (0-100%)
                const xPercent = Math.max(0, Math.min(100, (mouseRelativeX / containerWidth) * 100));
                const yPercent = Math.max(0, Math.min(100, (mouseRelativeY / containerHeight) * 100));
                
                // Calculate opacity based on distance from edges
                const distFromLeft = mouseRelativeX;
                const distFromRight = containerWidth - mouseRelativeX;
                const distFromTop = mouseRelativeY;
                const distFromBottom = containerHeight - mouseRelativeY;
                const minDist = Math.min(distFromLeft, distFromRight, distFromTop, distFromBottom);
                
                // Stronger glare near edges and corners
                const edgeThreshold = 80;
                const cornerMultiplier = minDist < edgeThreshold ? (edgeThreshold - minDist) / edgeThreshold : 0;
                targetGlareOpacity = Math.min(0.7, 0.25 + cornerMultiplier * 0.45);
                
                // Smooth interpolation for position
                currentX += (xPercent - currentX) * 0.15;
                currentY += (yPercent - currentY) * 0.15;
            } else {
                targetGlareOpacity = 0;
            }
            
            // Smooth interpolation for opacity
            glareOpacity += (targetGlareOpacity - glareOpacity) * 0.15;
            
            // Update CSS variables
            glassmorphicContainer.style.setProperty('--x', `${currentX}%`);
            glassmorphicContainer.style.setProperty('--y', `${currentY}%`);
            glassmorphicContainer.style.setProperty('--glare-opacity', glareOpacity);
            
            // Continue animation if opacity is changing or mouse is near
            if (Math.abs(targetGlareOpacity - glareOpacity) > 0.01 || Math.abs(glareOpacity) > 0.01 || isNearContainer) {
                rafId = requestAnimationFrame(updateGlare);
                isAnimating = true;
            } else {
                isAnimating = false;
                rafId = null;
            }
        }
        
        function handleMouseMove(e) {
            mouseX = e.clientX;
            mouseY = e.clientY;
            if (!isAnimating) {
                rafId = requestAnimationFrame(updateGlare);
                isAnimating = true;
            }
        }
        
        function handleMouseLeave() {
            targetGlareOpacity = 0;
        }
        
        // Only add listeners if container exists
        if (glassmorphicContainer) {
            document.addEventListener('mousemove', handleMouseMove, { passive: true });
            glassmorphicContainer.addEventListener('mouseleave', handleMouseLeave);
            // Start initial check
            updateGlare();
        }
    }
});
