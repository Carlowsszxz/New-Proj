// map.html UI-only interactivity (fade, nav, cursor, burger, Lucide)
document.addEventListener('DOMContentLoaded', function(){
    if(window.lucide) lucide.createIcons();
    
    // Refresh button - no click animation, only hover spin
    // (Animation is handled via CSS hover state)
    
    // Full Map button - no click animation, only hover pulse
    // (Animation is handled via CSS hover state)
    // Fade in content
    setTimeout(() => {
        const fadeContent = document.querySelector('.fade-content');
        if(fadeContent) fadeContent.classList.add('is-visible');
    }, 100);
    // Cursor follower effect
    const cursorFollower = document.getElementById('cursor-follower');
    let mouseX=0, mouseY=0, followerX=0, followerY=0;
    document.addEventListener('mousemove',e=>{mouseX=e.clientX;mouseY=e.clientY;cursorFollower.style.opacity='1';});
    function animateCursor(){followerX+=(mouseX-followerX)*0.1;followerY+=(mouseY-followerY)*0.1;cursorFollower.style.transform=`translate(${followerX}px,${followerY}px) translate(-50%,-50%)`;requestAnimationFrame(animateCursor);}
    animateCursor();
    // Header trigger
    const headerTrigger=document.getElementById('headerTrigger');
    const headerNav=document.getElementById('headerNav');
    let headerExpanded=false;
    headerTrigger.addEventListener('click',()=>{
        headerExpanded=!headerExpanded;
        if(headerExpanded){headerTrigger.classList.add('header-expanded','trigger-expanded');headerNav.classList.remove('header-collapsed');headerNav.classList.add('header-expanded');}
        else{headerTrigger.classList.remove('header-expanded','trigger-expanded');headerNav.classList.remove('header-expanded');headerNav.classList.add('header-collapsed');}
    });
    // Mobile burger
    const burgerBtn=document.getElementById('burgerMenuBtn');
    const mobileOverlay=document.getElementById('mobileMenuOverlay');
    const mobilePanel=document.getElementById('mobileMenuPanel');
    burgerBtn.addEventListener('click',()=>{
        burgerBtn.classList.toggle('active');mobileOverlay.classList.toggle('active');mobilePanel.classList.toggle('active');
    });
    mobileOverlay.addEventListener('click',()=>{
        burgerBtn.classList.remove('active');mobileOverlay.classList.remove('active');mobilePanel.classList.remove('active');
    });
    // Nav item hover labels
    const navItems=document.querySelectorAll('.sidebar-nav-item');
    const navLabel=document.getElementById('navLabel');
    navItems.forEach(item=>{
        item.addEventListener('mouseenter',e=>{const label=e.currentTarget.getAttribute('data-label');navLabel.textContent=label;navLabel.classList.add('visible');});
        item.addEventListener('mouseleave',()=>{navLabel.classList.remove('visible');});
    });
});
