(function() {
  let pageLoaded = false;
  let kPressed = false;

  const loadingMessages = [
    "Booting system...",
    "Starting system services...",
    "Establishing network connection...",
    "Applying user preferences...",
    "Rendering desktop wallpaper...",
    "Starting background services...",
    "Connecting to update server...",
    "Checking for pending updates...",
    "Restoring previous session...",
    "Loading user profile...",
    "Almost ready to launch desktop...",
    "Waiting for the spinning wheel of doom to stop...",
    "Bribing your dumba$$ Chromebook to load",
  ];

  const randomMessage = loadingMessages[Math.floor(Math.random() * loadingMessages.length)];

  const loader = document.createElement('div');
  loader.id = 'page-loader';
  loader.style.cssText = `
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: 
      radial-gradient(ellipse at top left, rgba(255,255,255,0.02) 0%, transparent 50%),
      radial-gradient(ellipse at top right, rgba(255,255,255,0.015) 0%, transparent 50%),
      radial-gradient(ellipse at bottom left, rgba(255,255,255,0.01) 0%, transparent 50%),
      linear-gradient(135deg, #0a0e14 0%, #050709 50%, #000000 100%);
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    transition: opacity 0.8s ease;
    overflow: hidden;
  `;

  const titleText = document.createElement('div');
  titleText.textContent = 'Plutonium Network';
  titleText.style.cssText = `
    position: relative;
    color: rgba(255, 255, 255, 1);
    font-size: 32px;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-weight: 700;
    letter-spacing: 3px;
    margin-bottom: 20px;
    text-shadow: 0 0 30px rgba(255, 255, 255, 0.5), 0 0 60px rgba(255, 255, 255, 0.2);
    z-index: 10;
    text-transform: uppercase;
  `;

  const particlesContainer = document.createElement('div');
  particlesContainer.style.cssText = `
    position: absolute;
    width: 100%;
    height: 100%;
    overflow: hidden;
  `;

  for (let i = 0; i < 80; i++) {
    const particle = document.createElement('div');
    particle.style.cssText = `
      position: absolute;
      width: ${Math.random() * 6 + 2}px;
      height: ${Math.random() * 6 + 2}px;
      background: rgba(255, 255, 255, ${Math.random() * 0.6 + 0.2});
      border-radius: 50%;
      left: ${Math.random() * 100}%;
      top: ${Math.random() * 100}%;
      animation: float ${Math.random() * 15 + 8}s infinite ease-in-out;
      animation-delay: ${Math.random() * 5}s;
      filter: blur(${Math.random() * 2}px);
    `;
    particlesContainer.appendChild(particle);
  }

  const loadingText = document.createElement('div');
  loadingText.textContent = randomMessage;
  loadingText.style.cssText = `
    position: relative;
    color: rgba(255, 255, 255, 0.9);
    font-size: 24px;
    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
    font-weight: 300;
    letter-spacing: 2px;
    margin-bottom: 60px;
    text-shadow: 0 0 20px rgba(255, 255, 255, 0.3);
    animation: textPulse 3s ease-in-out infinite;
    z-index: 10;
  `;

  const loaderContainer = document.createElement('div');
  loaderContainer.style.cssText = `
    position: relative;
    width: 350px;
    height: 350px;
  `;

  for (let i = 0; i < 3; i++) {
    const ring = document.createElement('div');
    ring.style.cssText = `
      position: absolute;
      top: 50%;
      left: 50%;
      width: ${260 - i * 50}px;
      height: ${260 - i * 50}px;
      margin-left: ${-(260 - i * 50) / 2}px;
      margin-top: ${-(260 - i * 50) / 2}px;
      border: ${4 - i * 0.5}px solid transparent;
      border-top-color: rgba(255, 255, 255, ${0.9 - i * 0.2});
      border-right-color: rgba(255, 255, 255, ${0.7 - i * 0.2});
      border-bottom-color: rgba(255, 255, 255, ${0.3 - i * 0.1});
      border-radius: 50%;
      animation: spin ${1.5 + i * 0.4}s linear infinite;
      animation-direction: ${i % 2 === 0 ? 'normal' : 'reverse'};
      filter: drop-shadow(0 0 ${12 - i * 2}px rgba(255, 255, 255, 0.5));
    `;
    loaderContainer.appendChild(ring);
  }

  const centerOrb = document.createElement('div');
  centerOrb.style.cssText = `
    position: absolute;
    top: 50%;
    left: 50%;
    width: 70px;
    height: 70px;
    margin-left: -35px;
    margin-top: -35px;
    background: radial-gradient(circle, rgba(255,255,255,1) 0%, rgba(255,255,255,0.6) 50%, rgba(255,255,255,0.2) 100%);
    border-radius: 50%;
    box-shadow: 
      0 0 30px rgba(255, 255, 255, 0.9),
      0 0 60px rgba(255, 255, 255, 0.7),
      0 0 90px rgba(255, 255, 255, 0.5),
      inset 0 0 30px rgba(255, 255, 255, 0.6);
    animation: pulse 2s ease-in-out infinite;
  `;
  loaderContainer.appendChild(centerOrb);

  for (let orbit = 0; orbit < 2; orbit++) {
    for (let i = 0; i < 12; i++) {
      const dot = document.createElement('div');
      dot.style.cssText = `
        position: absolute;
        width: ${orbit === 0 ? 14 : 10}px;
        height: ${orbit === 0 ? 14 : 10}px;
        background: radial-gradient(circle, white, rgba(255, 255, 255, 0.6));
        border-radius: 50%;
        top: 50%;
        left: 50%;
        margin-left: ${orbit === 0 ? -7 : -5}px;
        margin-top: ${orbit === 0 ? -7 : -5}px;
        box-shadow: 0 0 20px rgba(255, 255, 255, 0.9);
        animation: orbit ${orbit === 0 ? 4 : 3}s linear infinite;
        animation-delay: ${i * (orbit === 0 ? 0.333 : 0.25)}s;
        transform-origin: ${orbit === 0 ? 130 : 90}px 0;
        opacity: ${orbit === 0 ? 1 : 0.7};
      `;
      loaderContainer.appendChild(dot);
    }
  }

  const borderFrame = document.createElement('div');
  borderFrame.style.cssText = `
    position: fixed;
    top: 20px;
    left: 20px;
    right: 20px;
    bottom: 20px;
    pointer-events: none;
    z-index: 10000;
    transition: opacity 0.8s ease;
  `;

  const topBorder = document.createElement('div');
  topBorder.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, 
      rgba(255, 255, 255, 0.1) 0%,
      rgba(255, 255, 255, 0.1) 100%);
    overflow: hidden;
  `;

  const rightBorder = document.createElement('div');
  rightBorder.style.cssText = `
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: 3px;
    background: linear-gradient(180deg, 
      rgba(255, 255, 255, 0.1) 0%,
      rgba(255, 255, 255, 0.1) 100%);
    overflow: hidden;
  `;

  const bottomBorder = document.createElement('div');
  bottomBorder.style.cssText = `
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: linear-gradient(90deg, 
      rgba(255, 255, 255, 0.1) 0%,
      rgba(255, 255, 255, 0.1) 100%);
    overflow: hidden;
  `;

  const leftBorder = document.createElement('div');
  leftBorder.style.cssText = `
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    width: 3px;
    background: linear-gradient(180deg, 
      rgba(255, 255, 255, 0.1) 0%,
      rgba(255, 255, 255, 0.1) 100%);
    overflow: hidden;
  `;

  const topLight = document.createElement('div');
  topLight.style.cssText = `
    position: absolute;
    width: 700px;
    height: 100%;
    background: linear-gradient(90deg, 
      transparent 0%,
      rgba(255, 255, 255, 0.6) 20%,
      rgba(255, 255, 255, 1) 40%,
      rgba(255, 255, 255, 1) 60%,
      rgba(255, 255, 255, 0.6) 80%,
      transparent 100%);
    box-shadow: 
      0 0 80px rgba(255, 255, 255, 1), 
      0 0 150px rgba(255, 255, 255, 0.8),
      0 0 250px rgba(255, 255, 255, 0.5);
    animation: topSweep 6s linear infinite;
  `;

  const rightLight = document.createElement('div');
  rightLight.style.cssText = `
    position: absolute;
    width: 100%;
    height: 700px;
    background: linear-gradient(180deg, 
      transparent 0%,
      rgba(255, 255, 255, 0.6) 20%,
      rgba(255, 255, 255, 1) 40%,
      rgba(255, 255, 255, 1) 60%,
      rgba(255, 255, 255, 0.6) 80%,
      transparent 100%);
    box-shadow: 
      0 0 80px rgba(255, 255, 255, 1), 
      0 0 150px rgba(255, 255, 255, 0.8),
      0 0 250px rgba(255, 255, 255, 0.5);
    animation: rightSweep 6s linear infinite;
  `;

  const bottomLight = document.createElement('div');
  bottomLight.style.cssText = `
    position: absolute;
    width: 700px;
    height: 100%;
    background: linear-gradient(90deg, 
      transparent 0%,
      rgba(255, 255, 255, 0.6) 20%,
      rgba(255, 255, 255, 1) 40%,
      rgba(255, 255, 255, 1) 60%,
      rgba(255, 255, 255, 0.6) 80%,
      transparent 100%);
    box-shadow: 
      0 0 80px rgba(255, 255, 255, 1), 
      0 0 150px rgba(255, 255, 255, 0.8),
      0 0 250px rgba(255, 255, 255, 0.5);
    animation: bottomSweep 6s linear infinite;
  `;

  const leftLight = document.createElement('div');
  leftLight.style.cssText = `
    position: absolute;
    width: 100%;
    height: 700px;
    background: linear-gradient(180deg, 
      transparent 0%,
      rgba(255, 255, 255, 0.6) 20%,
      rgba(255, 255, 255, 1) 40%,
      rgba(255, 255, 255, 1) 60%,
      rgba(255, 255, 255, 0.6) 80%,
      transparent 100%);
    box-shadow: 
      0 0 80px rgba(255, 255, 255, 1), 
      0 0 150px rgba(255, 255, 255, 0.8),
      0 0 250px rgba(255, 255, 255, 0.5);
    animation: leftSweep 6s linear infinite;
  `;

  topBorder.appendChild(topLight);
  rightBorder.appendChild(rightLight);
  bottomBorder.appendChild(bottomLight);
  leftBorder.appendChild(leftLight);

  borderFrame.appendChild(topBorder);
  borderFrame.appendChild(rightBorder);
  borderFrame.appendChild(bottomBorder);
  borderFrame.appendChild(leftBorder);

  const style = document.createElement('style');
  style.textContent = `
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
    @keyframes pulse {
      0%, 100% { 
        transform: scale(1);
        opacity: 1;
      }
      50% { 
        transform: scale(1.4);
        opacity: 0.6;
      }
    }
    @keyframes orbit {
      0% { transform: rotate(0deg) translateX(80px) rotate(0deg); }
      100% { transform: rotate(360deg) translateX(80px) rotate(-360deg); }
    }
    @keyframes float {
      0%, 100% { 
        transform: translateY(0) translateX(0) scale(1);
        opacity: 0.3;
      }
      25% {
        transform: translateY(-40px) translateX(30px) scale(1.2);
        opacity: 0.9;
      }
      50% { 
        transform: translateY(-80px) translateX(-30px) scale(0.8);
        opacity: 0.5;
      }
      75% {
        transform: translateY(-40px) translateX(-50px) scale(1.1);
        opacity: 0.8;
      }
    }
    @keyframes textPulse {
      0%, 100% { 
        opacity: 0.9;
        transform: scale(1);
      }
      50% { 
        opacity: 1;
        transform: scale(1.02);
      }
    }
    @keyframes topSweep {
      0% { left: -700px; opacity: 0; }
      8% { opacity: 1; }
      20% { left: 100%; opacity: 0; }
      100% { left: 100%; opacity: 0; }
    }
    @keyframes rightSweep {
      0%, 20% { top: -700px; opacity: 0; }
      28% { opacity: 1; }
      50% { top: 100%; opacity: 0; }
      100% { top: 100%; opacity: 0; }
    }
    @keyframes bottomSweep {
      0%, 50% { right: -700px; opacity: 0; }
      58% { opacity: 1; }
      70% { right: 100%; opacity: 0; }
      100% { right: 100%; opacity: 0; }
    }
    @keyframes leftSweep {
      0%, 70% { bottom: -700px; opacity: 0; }
      78% { opacity: 1; }
      100% { bottom: 100%; opacity: 0; }
    }
  `;
  document.head.appendChild(style);

  loader.appendChild(particlesContainer);
  loader.appendChild(titleText);
  loader.appendChild(loadingText);
  loader.appendChild(loaderContainer);
  document.body.insertBefore(loader, document.body.firstChild);
  document.body.appendChild(borderFrame);

  document.body.style.overflow = 'hidden';

  function hideLoader() {
    loader.style.opacity = '0';
    borderFrame.style.opacity = '0';
    setTimeout(() => {
      loader.remove();
      borderFrame.remove();
      document.body.style.overflow = '';
    }, 800);
  }

  function checkAndHide() {
    if (pageLoaded && !kPressed) {
      hideLoader();
    }
  }

  window.addEventListener('load', () => {
    pageLoaded = true;
    checkAndHide();
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'k' || e.key === 'K') {
      kPressed = true;
    }
  });

  document.addEventListener('keyup', (e) => {
    if (e.key === 'k' || e.key === 'K') {
      kPressed = false;
      checkAndHide();
    }
  });

  setTimeout(() => {
    if (!kPressed) {
      hideLoader();
    }
  }, 30000);
})();