import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.153.0/build/three.module.js';

// forward client-side errors to server
function logToServer(obj){
  fetch('/log', {method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(obj)}).catch(()=>{});
}

// Forward console methods to server as well for remote debugging
['error','warn','info','log'].forEach(level=>{
  const orig = console[level].bind(console);
  console[level] = function(...args){
    try{ logToServer({level, args}); } catch(e){}
    orig(...args);
  };
});

window.addEventListener('error', (e)=>{ logToServer({message: e.message, filename: e.filename, lineno: e.lineno, colno: e.colno, stack: e.error && e.error.stack}); });
window.addEventListener('unhandledrejection', (e)=>{ logToServer({message: 'unhandledrejection', reason: String(e.reason)}); });

(async function(){
  try{
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1000);
  camera.position.set(0, 3, 40);

    const renderer = new THREE.WebGLRenderer({antialias:true});
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio ? window.devicePixelRatio : 1);
    document.getElementById('container').appendChild(renderer.domElement);

    // Player object (invisible, just for movement)
  const player = new THREE.Object3D();
  // Spawn player further back to frame larger images
  player.position.set(0, 0, 40);
    scene.add(player);

    // WASD movement controls
    const keys = { w: false, a: false, s: false, d: false };
    const moveSpeed = 0.05; // Slower movement
    const mouseSensitivity = 0.002;
    let pitch = 0, yaw = 0;
    
    // Crazy mode variables
    let crazyMode = false;
    let crazyModeAudio = null;
    let skyColorTimer = 0;
    const originalSkyColor = new THREE.Color(0x0a0a0a);
    const crazyModeUI = document.getElementById('crazy-mode-ui');

    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (keys.hasOwnProperty(key)) keys[key] = true;
      
      // Toggle crazy mode with P key
      if (key === 'p') {
        toggleCrazyMode();
      }
    });

    window.addEventListener('keyup', (e) => {
      const key = e.key.toLowerCase();
      if (keys.hasOwnProperty(key)) keys[key] = false;
    });

    // Mouse look controls (reliable re-lock after tabbing out)
    let isPointerLocked = false;
    const lockTarget = renderer.domElement || document.body;
    function requestLock(){
      if (!isPointerLocked) lockTarget.requestPointerLock?.();
    }
    function updateLockState(){
      isPointerLocked = document.pointerLockElement === lockTarget;
    }
    document.addEventListener('pointerlockchange', updateLockState);
    document.addEventListener('pointerlockerror', () => { /* ignore */ });
    document.addEventListener('visibilitychange', () => {
      // When tabbing away, lock is typically released
      if (document.visibilityState !== 'visible') isPointerLocked = false;
    });
    // Always try to lock on user gestures if not locked (no one-time listeners)
    const tryLock = () => { if (!isPointerLocked) requestLock(); };
    window.addEventListener('mousedown', tryLock);
    window.addEventListener('click', tryLock);
    window.addEventListener('keydown', tryLock);
    
    document.addEventListener('mousemove', (e) => {
      if (isPointerLocked) {
        yaw -= e.movementX * mouseSensitivity;
        pitch -= e.movementY * mouseSensitivity;
        pitch = Math.max(-Math.PI/2, Math.min(Math.PI/2, pitch)); // Clamp pitch
      }
    });

    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(5,10,7);
    scene.add(dir);
    scene.add(new THREE.AmbientLight(0x666666, 0.8));
    
    // Add moon in the sky
    function createMoon() {
      const moonGeometry = new THREE.SphereGeometry(8, 32, 32);
      
      // Create moon texture using canvas
      const moonCanvas = document.createElement('canvas');
      moonCanvas.width = moonCanvas.height = 512;
      const moonCtx = moonCanvas.getContext('2d');
      
      // Base moon color (pale yellow/white)
      const gradient = moonCtx.createRadialGradient(256, 256, 0, 256, 256, 256);
      gradient.addColorStop(0, '#f8f8ff');
      gradient.addColorStop(0.7, '#e6e6fa');
      gradient.addColorStop(1, '#d3d3d3');
      moonCtx.fillStyle = gradient;
      moonCtx.fillRect(0, 0, 512, 512);
      
      // Add crater details
      for (let i = 0; i < 15; i++) {
        const x = Math.random() * 512;
        const y = Math.random() * 512;
        const radius = 10 + Math.random() * 30;
        const alpha = 0.1 + Math.random() * 0.3;
        
        moonCtx.beginPath();
        moonCtx.arc(x, y, radius, 0, Math.PI * 2);
        moonCtx.fillStyle = `rgba(180, 180, 180, ${alpha})`;
        moonCtx.fill();
        
        // Inner shadow for crater depth
        moonCtx.beginPath();
        moonCtx.arc(x + radius * 0.2, y + radius * 0.2, radius * 0.6, 0, Math.PI * 2);
        moonCtx.fillStyle = `rgba(120, 120, 120, ${alpha * 0.5})`;
        moonCtx.fill();
      }
      
      const moonTexture = new THREE.CanvasTexture(moonCanvas);
      if (moonTexture.colorSpace !== undefined) moonTexture.colorSpace = THREE.SRGBColorSpace;
      
      const moonMaterial = new THREE.MeshBasicMaterial({ 
        map: moonTexture,
        transparent: true,
        opacity: 0.9
      });
      
      const moon = new THREE.Mesh(moonGeometry, moonMaterial);
      moon.position.set(-60, 80, -100); // High in the sky, off to the side
      
      return moon;
    }
    
    const moon = createMoon();
    scene.add(moon);
    
    // Create infinite ground with dotted grass/dirt texture
    function makeDottedGroundTexture(size = 512) {
      const c = document.createElement('canvas');
      c.width = c.height = size;
      const ctx = c.getContext('2d');
      // base
      ctx.fillStyle = '#2d5a2d';
      ctx.fillRect(0, 0, size, size);
      // subtle variation noise
      const noiseCount = 8000;
      for (let i = 0; i < noiseCount; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const a = 0.05 + Math.random() * 0.08;
        const shade = 35 + Math.floor(Math.random() * 25);
        ctx.fillStyle = `rgba(${shade},${shade+20},${shade},${a})`;
        ctx.fillRect(x, y, 1, 1);
      }
      // random darker dots (dirt/grass clumps)
      const dots = 1400;
      for (let i = 0; i < dots; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = 0.6 + Math.random() * 1.8;
        const alpha = 0.15 + Math.random() * 0.35;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        // mix of very dark green and near-black
        const dark = Math.random() < 0.75;
        ctx.fillStyle = dark ? `rgba(10,20,10,${alpha})` : `rgba(12,12,12,${alpha})`;
        ctx.fill();
      }
      // occasional tiny bright specks (dry grass)
      const specks = 400;
      for (let i = 0; i < specks; i++) {
        const x = Math.random() * size;
        const y = Math.random() * size;
        const r = 0.4 + Math.random() * 0.8;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(120,130,70,0.15)';
        ctx.fill();
      }
      const tex = new THREE.CanvasTexture(c);
      if (tex.colorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
      return tex;
    }

    const groundTexture = makeDottedGroundTexture(512);
    groundTexture.repeat.set(80, 80);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(1000, 1000),
      new THREE.MeshStandardMaterial({ map: groundTexture })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -1.5;
    scene.add(ground);

    // Simple rain particle system
    function createRain({ count = 3000, area = 120, topY = 80, groundY = -1.5 } = {}){
      const positions = new Float32Array(count * 3);
      const speeds = new Float32Array(count);
        for(let i=0; i<count; i++){
        const ix = i*3;
        positions[ix+0] = (Math.random() - 0.5) * area * 2; // x
        positions[ix+1] = Math.random() * topY;             // y
        positions[ix+2] = (Math.random() - 0.5) * area * 2; // z
          speeds[i] = 36 + Math.random() * 44; // faster rain
      }
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
      const mat = new THREE.PointsMaterial({
        color: 0x3a66cc, // darker blue
        size: 0.35,      // thinner
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false
      });
      const points = new THREE.Points(geom, mat);
      points.position.y = 0;
  const update = (dt, t) => {
        const pos = geom.attributes.position.array;
        const windX = Math.sin(t*0.3) * 3.0; // gentle wind sway
        for(let i=0;i<count;i++){
          const ix = i*3;
          pos[ix+1] -= speeds[i] * dt;  // fall
          pos[ix+0] += windX * dt;      // drift
          if(pos[ix+1] < groundY + 0.2){
            pos[ix+1] = topY * (0.7 + Math.random()*0.3);
            // randomize x/z a bit when resetting
            pos[ix+0] = (Math.random() - 0.5) * area * 2;
            pos[ix+2] = (Math.random() - 0.5) * area * 2;
          }
        }
        geom.attributes.position.needsUpdate = true;
      };
      return { points, update };
    }

  const rain = createRain({ count: 4500, area: 180, topY: 120, groundY: -1.5 });
  // Add rain and have it follow the player so it covers the world around them
  scene.add(rain.points);

    // Add ambient music and walking sounds
  const listener = new THREE.AudioListener();
  camera.add(listener);
    
  // Setup walking sound and movement variables
  let isWalking = false;
  let walkSoundPlaying = false;
    
    // Background music from files instead of synthetic ambient
    let music1, music2; // Store references for crazy mode control
    let musicStarted = false; // Track if music has been started
    function setupBackgroundMusic(){
  music1 = new Audio('music.mp3');
  music2 = new Audio('music2.mp3');
  [music1, music2].forEach(a => { a.loop = true; a.volume = 0.35; a.addEventListener('error', ()=>console.warn(a.src + ' failed to load')); });
      const startMusic = () => {
        // Start both tracks; failures are ignored
        music1.play().catch(()=>{});
        music2.play().catch(()=>{});
        musicStarted = true; // Mark music as started
        window.removeEventListener('keydown', startMusic);
        window.removeEventListener('pointerdown', startMusic);
        window.removeEventListener('click', startMusic);
      };
      window.addEventListener('keydown', startMusic, { once: true });
      window.addEventListener('pointerdown', startMusic, { once: true });
      window.addEventListener('click', startMusic, { once: true });
    }
    
    // Walking sound using local audio file (public/walking.mp3)
  const walkingAudio = new Audio('walking.mp3');
    walkingAudio.loop = true;
    walkingAudio.volume = 0.6;
    walkingAudio.addEventListener('error', ()=> console.warn('walking.mp3 not found or failed to load'));
    // Prime audio permission on first click
  const primeWalk = () => {
      walkingAudio.play().then(() => { walkingAudio.pause(); walkingAudio.currentTime = 0; }).catch(()=>{});
      window.removeEventListener('keydown', primeWalk);
      window.removeEventListener('pointerdown', primeWalk);
    };
    window.addEventListener('keydown', primeWalk, { once: true });
    window.addEventListener('pointerdown', primeWalk, { once: true });
  window.addEventListener('click', primeWalk, { once: true });

    setupBackgroundMusic();
    
    // Crazy mode functions
    function toggleCrazyMode() {
      crazyMode = !crazyMode;
      
      if (crazyMode) {
        // Enable crazy mode
        crazyModeUI.innerHTML = 'Crazy Mode: ENABLED<br>Press P to disable';
        
        // Pause music2.mp3 during crazy mode (only if music has been started)
        if (music2 && musicStarted) {
          music2.pause();
        }
        
        // Start hype music
        if (!crazyModeAudio) {
          crazyModeAudio = new Audio('hype.mp3');
          crazyModeAudio.loop = true;
          crazyModeAudio.volume = 0.7;
          crazyModeAudio.addEventListener('error', () => console.warn('hype.mp3 not found'));
        }
        crazyModeAudio.play().catch(() => {});
        
        // Force all characters to start spinning
        sprites.forEach(sprite => {
          sprite.spinCooldown = -1; // negative means currently spinning
        });
        
      } else {
        // Disable crazy mode
        crazyModeUI.innerHTML = 'Crazy Mode: DISABLED<br>Press P to activate';
        
        // Stop hype music
        if (crazyModeAudio) {
          crazyModeAudio.pause();
          crazyModeAudio.currentTime = 0;
        }
        
        // Resume music2.mp3 (only if music has been started)
        if (music2 && musicStarted) {
          music2.play().catch(() => {});
        }
        
        // Reset sky color
        scene.background = originalSkyColor;
        
        // Stop forced spinning (let natural spin behavior take over)
        sprites.forEach(sprite => {
          if (sprite.spinCooldown < 0) {
            sprite.spinCooldown = 1 + Math.random() * 3; // reset to normal cooldown
          }
        });
      }
    }    const heads = [];
    // Dynamic image loading from server
    const texLoader = new THREE.TextureLoader();
  const sprites = [];
  const raycaster = new THREE.Raycaster();
  const mouseNDC = new THREE.Vector2(0,0); // center ray
    const groundY = -1.5;
    fetch('/assets/images').then(r=>r.json()).then((images)=>{
      if (!Array.isArray(images) || images.length === 0) {
        console.warn('No images from server, using fallback list');
        // Fallback hardcoded list for Vercel
        const fallbackImages = [
          '/images/Banks.png',
          '/images/Brez.png', 
          '/images/Doge.png',
          '/images/Elon.png',
          '/images/Fatass.png',
          '/images/Ross.png',
          '/images/TJR.png',
          '/images/Tate.png',
          '/images/Trump.png'
        ];
        loadCharacters(fallbackImages);
        return;
      }
      loadCharacters(images);
    }).catch(e => {
      console.error('Error fetching images:', e);
      // Fallback hardcoded list for Vercel
      const fallbackImages = [
        '/images/Banks.png',
        '/images/Brez.png', 
        '/images/Doge.png',
        '/images/Elon.png',
        '/images/Fatass.png',
        '/images/Ross.png',
        '/images/TJR.png',
        '/images/Tate.png',
        '/images/Trump.png'
      ];
      loadCharacters(fallbackImages);
    });

    function loadCharacters(images) {
  images.forEach((url, i)=>{
        texLoader.load(url, (tex)=>{
          if (tex.colorSpace !== undefined) tex.colorSpace = THREE.SRGBColorSpace;
          const aspect = tex.image && tex.image.width ? (tex.image.width / tex.image.height) : 1;
          const height = 24 * 0.8; // 20% smaller
          const width = height * aspect;
          const geo = new THREE.PlaneGeometry(width, height);
          const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.05, side: THREE.DoubleSide });
          const plane = new THREE.Mesh(geo, mat);
          // Spread initial positions randomly across a wide area, ensuring minimum distance between spawns
          const mapSize = 20; // much much smaller area
          const minDistBetweenSpawns = 0.3; // extremely close spawn spacing
          const maxAttempts = 50; // prevent infinite loops
          
          let x, z, validPosition = false, attempts = 0;
          
          // Try to find a position that's far enough from existing sprites
          while (!validPosition && attempts < maxAttempts) {
            x = (Math.random() - 0.5) * mapSize;
            z = (Math.random() - 0.5) * mapSize;
            
            // Check distance from player
            const distFromPlayer = Math.sqrt(x*x + z*z);
            if (distFromPlayer < 1) { // very close to player // extremely close to player allowed
              attempts++;
              continue;
            }
            
            // Check distance from other spawned sprites
            validPosition = true;
            for (const otherSprite of sprites) {
              const dx = x - otherSprite.mesh.position.x;
              const dz = z - otherSprite.mesh.position.z;
              const dist = Math.sqrt(dx*dx + dz*dz);
              if (dist < minDistBetweenSpawns) {
                validPosition = false;
                break;
              }
            }
            attempts++;
          }
          
          // If we couldn't find a valid position, use a fallback
          if (!validPosition) {
            const angle = (sprites.length / Math.max(1, images.length)) * Math.PI * 2;
            const radius = 1 + sprites.length * 0.3; // extremely tight fallback
            x = Math.cos(angle) * radius;
            z = Math.sin(angle) * radius;
          }
          
          plane.position.set(x, groundY + height*0.5, z);
          scene.add(plane);
          // Simple wander/jump/spin behavior state
          sprites.push({
            mesh: plane,
            vel: new THREE.Vector3((Math.random()*2-1)*1.5, 0, (Math.random()*2-1)*1.5),
            targetTimer: 1 + Math.random()*2,
            spinCooldown: 1 + Math.random()*3,
            randomMoveTimer: 1.0 + Math.random()*3.0, // much less frequent random movements
            wanderAngle: Math.random() * Math.PI * 2, // random wander direction
            baseHeight: groundY + height*0.5,
            // Use a radius scaled to actual sprite size so spacing matches visuals
            radius: Math.max(width, height) * 0.4,
            height: height,
            filename: url.split('/').pop(),
            faceTimer: 0.4 + Math.random()*0.8,
            faceUser: Math.random() < 0.4
          });
          heads.push({ mesh: plane, talk: (v)=>{ plane.scale.y = 1 + v*0.04; } });
        }, undefined, (e)=>console.warn('Failed to load image', url, e));
      });
    }

    // Hover label handling
    const hoverCanvas = document.createElement('canvas');
  hoverCanvas.width = 1536; hoverCanvas.height = 384; // 2x bigger than current
    const hoverCtx = hoverCanvas.getContext('2d');
    const hoverTex = new THREE.CanvasTexture(hoverCanvas);
    const hoverMat = new THREE.MeshBasicMaterial({ map: hoverTex, transparent: true });
  const hoverGeo = new THREE.PlaneGeometry(24, 6); // 2x bigger label plane
    const hoverLabel = new THREE.Mesh(hoverGeo, hoverMat);
    hoverLabel.visible = false;
    scene.add(hoverLabel);

    function setHoverText(text){
      hoverCtx.clearRect(0,0,hoverCanvas.width,hoverCanvas.height);
  hoverCtx.font = 'Bold 192px Arial'; // 2x bigger font
      hoverCtx.fillStyle = '#00ff00';
      hoverCtx.textAlign = 'center';
  hoverCtx.fillText(text, hoverCanvas.width/2, 258); // 2x vertical offset
      hoverTex.needsUpdate = true;
    }
    // Build different procedural heads with varying characteristics
    function createProceduralHead(index, variant = 'default'){
      const headGroup = new THREE.Group();

      // Realistic head characteristics by variant
      let headColor, hairColor, headScale, eyeColor, skinRoughness;
      
      if (variant === 'trump') {
        headColor = 0xf4a460; // Trump's distinctive tan
        hairColor = 0xffd700; // Blonde/gold
        headScale = [1.2, 0.95, 1.1]; // Wider, slightly flatter
        eyeColor = 0x4169e1; // Blue eyes
        skinRoughness = 0.8;
      } else if (variant === 'musk') {
        headColor = 0xfdbcb4; // Pale pink skin
        hairColor = 0x8b4513; // Dark brown
        headScale = [0.9, 1.15, 1.0]; // Narrower, taller
        eyeColor = 0x228b22; // Green eyes
        skinRoughness = 0.6;
      } else {
        headColor = 0xefe3d1;
        hairColor = 0x222222;
        headScale = [1.0, 1.0, 1.0];
        eyeColor = 0x654321;
        skinRoughness = 0.7;
      }

      // Main head - more realistic proportions
      const headGeometry = new THREE.SphereGeometry(1.0, 32, 32);
      headGeometry.scale(headScale[0], headScale[1], headScale[2]);
      
      const head = new THREE.Mesh(
        headGeometry,
        new THREE.MeshStandardMaterial({
          color: headColor, 
          metalness: 0.02, 
          roughness: skinRoughness,
          normalScale: new THREE.Vector2(0.1, 0.1)
        })
      );
      headGroup.add(head);

      // Realistic hair styling
      if (variant === 'trump') {
        // Trump's signature combover
        const hairBase = new THREE.Mesh(
          new THREE.SphereGeometry(1.05, 24, 24),
          new THREE.MeshStandardMaterial({color: hairColor, roughness: 0.9})
        );
        hairBase.position.y = 0.3;
        hairBase.scale.set(0.95, 0.4, 0.9);
        headGroup.add(hairBase);
        
        // Combover sweep
        const combover = new THREE.Mesh(
          new THREE.BoxGeometry(1.8, 0.2, 1.2),
          new THREE.MeshStandardMaterial({color: hairColor, roughness: 0.9})
        );
        combover.position.set(0.3, 0.7, -0.1);
        combover.rotation.z = -0.2;
        headGroup.add(combover);
        
      } else if (variant === 'musk') {
        // Musk's receding hairline and hair pattern
        const hair = new THREE.Mesh(
          new THREE.SphereGeometry(0.95, 24, 24),
          new THREE.MeshStandardMaterial({color: hairColor, roughness: 0.8})
        );
        hair.position.y = 0.4;
        hair.scale.set(0.8, 0.3, 0.85);
        headGroup.add(hair);
        
        // Receding temples
        const temple1 = new THREE.Mesh(
          new THREE.SphereGeometry(0.3, 16, 16),
          new THREE.MeshStandardMaterial({color: headColor, roughness: skinRoughness})
        );
        temple1.position.set(-0.6, 0.5, 0.2);
        headGroup.add(temple1);
        
        const temple2 = temple1.clone();
        temple2.position.set(0.6, 0.5, 0.2);
        headGroup.add(temple2);
      }

      // Realistic eyes
      const eyeWhite = new THREE.SphereGeometry(0.12, 16, 16);
      const eyeWhiteMaterial = new THREE.MeshStandardMaterial({color: 0xffffff, metalness: 0.1, roughness: 0.3});
      
      const leftEyeWhite = new THREE.Mesh(eyeWhite, eyeWhiteMaterial);
      leftEyeWhite.position.set(-0.3, 0.2, 0.85);
      leftEyeWhite.scale.z = 0.5;
      headGroup.add(leftEyeWhite);
      
      const rightEyeWhite = leftEyeWhite.clone();
      rightEyeWhite.position.x = 0.3;
      headGroup.add(rightEyeWhite);
      
      // Pupils/Iris
      const pupil = new THREE.SphereGeometry(0.07, 12, 12);
      const pupilMaterial = new THREE.MeshStandardMaterial({color: eyeColor});
      
      const leftPupil = new THREE.Mesh(pupil, pupilMaterial);
      leftPupil.position.set(-0.3, 0.2, 0.92);
      headGroup.add(leftPupil);
      
      const rightPupil = leftPupil.clone();
      rightPupil.position.x = 0.3;
      headGroup.add(rightPupil);

      // Realistic nose based on person
      let noseGeometry, noseScale, nosePosition;
      if (variant === 'trump') {
        noseGeometry = new THREE.ConeGeometry(0.12, 0.3, 8);
        noseScale = [1.2, 1.0, 1.0];
        nosePosition = [0, 0, 0.95];
      } else if (variant === 'musk') {
        noseGeometry = new THREE.ConeGeometry(0.08, 0.25, 8);
        noseScale = [1.0, 1.2, 1.0];
        nosePosition = [0, 0.05, 0.9];
      } else {
        noseGeometry = new THREE.ConeGeometry(0.1, 0.28, 8);
        noseScale = [1.0, 1.0, 1.0];
        nosePosition = [0, 0, 0.9];
      }
      
      const nose = new THREE.Mesh(
        noseGeometry,
        new THREE.MeshStandardMaterial({color: headColor, roughness: skinRoughness})
      );
      nose.position.set(...nosePosition);
      nose.rotation.x = Math.PI / 2;
      nose.scale.set(...noseScale);
      headGroup.add(nose);

      // Mouth - animated part
      const mouth = new THREE.Mesh(
        new THREE.CylinderGeometry(0.25, 0.25, 0.1, 16),
        new THREE.MeshStandardMaterial({color: 0xcc4444, emissive: 0x220000})
      );
      mouth.position.set(0, -0.35, 0.8);
      mouth.rotation.x = Math.PI / 2;
      headGroup.add(mouth);

      // Eyebrows
      const browGeometry = new THREE.BoxGeometry(0.4, 0.08, 0.1);
      const browMaterial = new THREE.MeshStandardMaterial({color: hairColor, roughness: 0.9});
      
      const leftBrow = new THREE.Mesh(browGeometry, browMaterial);
      leftBrow.position.set(-0.25, 0.35, 0.85);
      leftBrow.rotation.z = variant === 'trump' ? -0.1 : 0;
      headGroup.add(leftBrow);
      
      const rightBrow = leftBrow.clone();
      rightBrow.position.x = 0.25;
      rightBrow.rotation.z = variant === 'trump' ? 0.1 : 0;
      headGroup.add(rightBrow);

      // Ears
      const earGeometry = new THREE.SphereGeometry(0.15, 12, 12);
      const earMaterial = new THREE.MeshStandardMaterial({color: headColor, roughness: skinRoughness});
      
      const leftEar = new THREE.Mesh(earGeometry, earMaterial);
      leftEar.position.set(-1.0, 0, 0.2);
      leftEar.scale.set(0.8, 1.2, 0.6);
      headGroup.add(leftEar);
      
      const rightEar = leftEar.clone();
      rightEar.position.x = 1.0;
      headGroup.add(rightEar);

      // Neck
      const neck = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.45, 0.8, 16),
        new THREE.MeshStandardMaterial({color: headColor, roughness: skinRoughness})
      );
      neck.position.y = -1.2;
      headGroup.add(neck);

      headGroup.position.set(positions[index], 2.5, 0);
      scene.add(headGroup);

      return { mesh: headGroup, mouth };
    }

    function makeFallback(index){
      const variants = ['trump', 'musk', 'default'];
      const labels = ['Trump', 'Musk', 'Generic'];
      const variant = variants[index] || 'default';
      const p = createProceduralHead(index, variant);
      
      // Add text label above head
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      canvas.width = 256;
      canvas.height = 64;
      context.font = 'Bold 24px Arial';
      context.fillStyle = 'white';
      context.textAlign = 'center';
      context.fillText(labels[index] || 'Head', 128, 40);
      
      const texture = new THREE.CanvasTexture(canvas);
      const labelMaterial = new THREE.MeshBasicMaterial({ map: texture, transparent: true });
      const labelGeometry = new THREE.PlaneGeometry(2, 0.5);
      const label = new THREE.Mesh(labelGeometry, labelMaterial);
      label.position.set(0, 1.8, 0);
      p.mesh.add(label);
      
      heads.push({ mesh: p.mesh, talk: (v)=>{ p.mouth.scale.y = Math.max(0.01, 1 + v * 1.6); p.mesh.rotation.x = -v * 0.06; } });
    }

    function simulateTalking(){
      if(heads.length === 0) return;
      const idx = Math.floor(Math.random()*heads.length);
      const h = heads[idx];
      const start = performance.now();
      const dur = 800 + Math.random()*1000;
      function step(){
        const t = (performance.now()-start)/dur;
        if(t >= 1){ h.talk(0); return; }
        const amp = Math.max(0, Math.sin(t*Math.PI*3) * (1 - t));
        h.talk(amp);
        requestAnimationFrame(step);
      }
      step();
    }
    setInterval(simulateTalking, 1200);

    let last = performance.now();
    function animate(){
      requestAnimationFrame(animate);
      const now = performance.now();
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      // Update camera rotation based on mouse
      camera.rotation.order = 'YXZ';
      camera.rotation.y = yaw;
      camera.rotation.x = pitch;

      // Calculate movement direction based on camera rotation
      const forward = new THREE.Vector3();
      const right = new THREE.Vector3();
      
      camera.getWorldDirection(forward);
      forward.y = 0; // Keep movement on ground plane
      forward.normalize();
      
      right.crossVectors(forward, new THREE.Vector3(0, 1, 0));
      right.normalize();

      // WASD movement relative to camera direction with different speeds
      const movement = new THREE.Vector3();
      const forwardBackSpeed = moveSpeed;
      const sideSpeed = moveSpeed * 0.75; // 25% slower for left/right
      
      let moving = false;
      if (keys.w) { movement.add(forward.clone().multiplyScalar(forwardBackSpeed)); moving = true; }
      if (keys.s) { movement.add(forward.clone().multiplyScalar(-forwardBackSpeed)); moving = true; }
      if (keys.a) { movement.add(right.clone().multiplyScalar(-sideSpeed)); moving = true; }
      if (keys.d) { movement.add(right.clone().multiplyScalar(sideSpeed)); moving = true; }
      
      // Handle walking sound (loop while moving, cut off when stopped)
      if (moving !== isWalking) {
        isWalking = moving;
        if (isWalking && !walkSoundPlaying) {
          walkingAudio.currentTime = 0; // start immediately
          walkingAudio.play().then(()=>{ walkSoundPlaying = true; }).catch(()=>{});
        } else if (!isWalking && walkSoundPlaying) {
          walkingAudio.pause();
          walkingAudio.currentTime = 0; // hard cut
          walkSoundPlaying = false;
        }
      }
      
      player.position.add(movement);

      // Camera follows player (first person)
      camera.position.copy(player.position);
      camera.position.y = player.position.y + 1.7; // Eye height

      // Raycast from screen center to detect hovered sprite
      raycaster.setFromCamera(mouseNDC, camera);
      const intersects = raycaster.intersectObjects(sprites.map(s=>s.mesh), true);
      if (intersects.length){
        const obj = intersects[0].object;
        const spr = sprites.find(s => s.mesh === obj || obj.parent === s.mesh);
        if (spr){
          const baseName = (spr.filename || '').replace(/\.[^/.]+$/, '');
          setHoverText(baseName);
          const labelY = spr.baseHeight + (spr.height || 24) * 0.5 + 2.0; // fully above head
          hoverLabel.position.set(spr.mesh.position.x, labelY, spr.mesh.position.z);
          hoverLabel.quaternion.copy(camera.quaternion);
          hoverLabel.visible = true;
        } else {
          hoverLabel.visible = false;
        }
      } else {
        hoverLabel.visible = false;
      }

      // wander/spin logic for image sprites (circle the player with randomness)
      const nowSec = now/1000;
      sprites.forEach((s, idx)=>{
        // update timers
        s.targetTimer -= dt;
        s.spinCooldown -= dt;
        s.randomMoveTimer -= dt;
        
        // choose new random direction occasionally
        if (s.targetTimer <= 0){
          // Mix of following user and random movement
          const toPlayer = new THREE.Vector3().subVectors(player.position, s.mesh.position);
          toPlayer.y = 0;
          
          if (Math.random() < 0.7) {
            // 70% chance to move toward player (following behavior)
            if (toPlayer.lengthSq() > 0.0001) {
              toPlayer.normalize();
              // Add some randomness to the direct path
              const randomOffset = new THREE.Vector3(
                (Math.random()*2-1)*0.4,
                0,
                (Math.random()*2-1)*0.4
              );
              toPlayer.add(randomOffset).normalize();
              const speed = 3.2 + Math.random()*2.5;
              s.vel.copy(toPlayer.multiplyScalar(speed));
            }
          } else {
            // 30% chance for random wander movement (much calmer)
            s.wanderAngle += (Math.random()*2-1) * 0.3; // gentle direction changes
            const wanderDir = new THREE.Vector3(
              Math.cos(s.wanderAngle),
              0,
              Math.sin(s.wanderAngle)
            );
            const speed = 1.0 + Math.random()*1.0; // much slower wander
            s.vel.copy(wanderDir.multiplyScalar(speed));
          }
          s.targetTimer = 1.2 + Math.random()*2.5;
        }
        
        // Random movement bursts (much less frequent and weaker)
        if (s.randomMoveTimer <= 0) {
          const burst = new THREE.Vector3(
            (Math.random()*2-1)*1.0, // much weaker bursts
            0,
            (Math.random()*2-1)*1.0  // much weaker bursts
          );
          s.vel.add(burst);
          s.randomMoveTimer = 2.0 + Math.random()*4.0; // much less frequent
        }
        // Steering: maintain ring around player (cohesion/repulsion) and separation
        const toPlayer = new THREE.Vector3().subVectors(player.position, s.mesh.position);
        toPlayer.y = 0;
        const dist = toPlayer.length();
        const desiredMin = 20;  // much farther from player
        const desiredMax = 50;  // wide ring size
        let steer = new THREE.Vector3();
        if (dist > desiredMax){
          steer.add(toPlayer.normalize().multiplyScalar(3.5));
        } else if (dist < desiredMin && dist > 0.0001){
          steer.add(toPlayer.normalize().multiplyScalar(-3.5));
        }
        // Light pursuit behavior so they kind of chase the user
        if (dist > 0.0001){
          const pursuitFactor = THREE.MathUtils.clamp((dist - desiredMin) / Math.max(1e-3, (desiredMax - desiredMin)), 0, 1);
          // inward pull grows with distance inside the band; small pull even inside the band
          const pursuitPull = 0.4 + 2.0 * pursuitFactor;
          steer.add(toPlayer.clone().normalize().multiplyScalar(pursuitPull));
        }
        // Separation from other sprites (simple O(n^2))
        for (let j=0; j<sprites.length; j++){
          if (j === idx) continue;
          const o = sprites[j];
          const delta = new THREE.Vector3().subVectors(s.mesh.position, o.mesh.position);
          delta.y = 0;
          const d = delta.length();
          const minD = (s.radius + o.radius) * 6.0; // much wider spacing
          if (d > 0.0001 && d < minD){
            // push away stronger when closer
            steer.add(delta.normalize().multiplyScalar((minD - d) * 12.0));
          }

          // Angular (lane) separation around the player to avoid single-file alignment
          const toPi = new THREE.Vector3().subVectors(player.position, s.mesh.position); toPi.y = 0; if (toPi.lengthSq() < 1e-6) continue;
          const toPj = new THREE.Vector3().subVectors(player.position, o.mesh.position); toPj.y = 0; if (toPj.lengthSq() < 1e-6) continue;
          const ai = Math.atan2(toPi.x, toPi.z);
          const aj = Math.atan2(toPj.x, toPj.z);
          let dAng = ai - aj; dAng = Math.atan2(Math.sin(dAng), Math.cos(dAng));
          const minAng = 0.5; // wide angular spacing (~28.6 degrees)
          if (Math.abs(dAng) < minAng){
            const tangent = new THREE.Vector3(-toPi.z, 0, toPi.x).normalize(); // lateral around player
            const sign = dAng >= 0 ? 1 : -1;
            const angPush = (minAng - Math.abs(dAng)) * 8.0; // strong push
            steer.add(tangent.multiplyScalar(sign * angPush));
          }
        }
        // Apply steering to velocity
        s.vel.add(steer.multiplyScalar(dt));
        // Clamp speed
        const maxSpeed = 6.2; // faster overall
        if (s.vel.length() > maxSpeed) s.vel.setLength(maxSpeed);
  // Move
        s.mesh.position.x += s.vel.x * dt;
        s.mesh.position.z += s.vel.z * dt;
  // keep constant vertical level
  s.mesh.position.y = s.baseHeight;
        // Facing behavior: bias to face the player about 50% more often
        s.faceTimer -= dt;
        if (s.faceTimer <= 0){
          // 60% chance to face the user when timer elapses (more often than not)
          s.faceUser = Math.random() < 0.6;
          s.faceTimer = 0.7 + Math.random()*1.1; // pick a new interval
        }
        let targetYaw;
        if (s.faceUser){
          // turn toward player
          const tp = new THREE.Vector3().subVectors(player.position, s.mesh.position);
          targetYaw = Math.atan2(tp.x, tp.z);
        } else {
          // face along movement direction
          targetYaw = Math.atan2(s.vel.x, s.vel.z);
        }
        // smooth turn toward targetYaw
        const curYaw = s.mesh.rotation.y;
        let deltaYaw = targetYaw - curYaw;
        // wrap to [-PI, PI]
        deltaYaw = Math.atan2(Math.sin(deltaYaw), Math.cos(deltaYaw));
        const turnRate = 4.0; // rad/s
        s.mesh.rotation.y = curYaw + THREE.MathUtils.clamp(deltaYaw, -turnRate*dt, turnRate*dt);
        // occasional spin
        if (s.spinCooldown <= 0 || crazyMode){
          s.mesh.rotation.y += (crazyMode ? 12 : 8) * dt; // faster spin in crazy mode
          if (!crazyMode && Math.random() < 0.15) s.spinCooldown = 0.8 + Math.random()*2.5; // end spin, more frequent
        } else {
          // gentle idle sway when not spinning
          s.mesh.rotation.y += Math.sin(now*0.0004 + idx)*0.12*dt;
        }
        // Reduce spin cooldown faster for more frequent spins
        if (!crazyMode) {
          if (s.spinCooldown > 0) {
            s.spinCooldown -= dt * (Math.random()*0.8 + 1.2);
          } else {
            // Randomly start spinning
            if (Math.random() < 0.02) { // 2% chance per frame to start spinning
              s.spinCooldown = -1; // negative means currently spinning
            }
          }
        }
      });
    // Hard resolve pass to ensure no overlaps in XZ plane (keeps distance when they move)
      for (let i = 0; i < sprites.length; i++){
        for (let j = i+1; j < sprites.length; j++){
          const a = sprites[i];
          const b = sprites[j];
          const delta = new THREE.Vector3().subVectors(a.mesh.position, b.mesh.position);
          delta.y = 0;
          const ra = a.radius; const rb = b.radius;
          const desired = (ra + rb) * 6.0; // much wider hard minimum
          const distSq = delta.x*delta.x + delta.z*delta.z;
          const desiredSq = desired*desired;
          if (distSq > 1e-6 && distSq < desiredSq){
            const dist = Math.sqrt(distSq);
            const overlap = desired - dist;
            const push = delta.multiplyScalar((overlap / dist) * 0.5); // split push
            a.mesh.position.x += push.x;
            a.mesh.position.z += push.z;
            b.mesh.position.x -= push.x;
            b.mesh.position.z -= push.z;
          }
          // Angular resolve: ensure they occupy different bearings around player
          const toA = new THREE.Vector3().subVectors(player.position, a.mesh.position); toA.y = 0;
          const toB = new THREE.Vector3().subVectors(player.position, b.mesh.position); toB.y = 0;
          if (toA.lengthSq() > 1e-6 && toB.lengthSq() > 1e-6){
            const aAng = Math.atan2(toA.x, toA.z);
            const bAng = Math.atan2(toB.x, toB.z);
            let dAng = aAng - bAng; dAng = Math.atan2(Math.sin(dAng), Math.cos(dAng));
            const minAng = 0.5; // wide angle
            if (Math.abs(dAng) < minAng){
              const tangentA = new THREE.Vector3(-toA.z, 0, toA.x).normalize();
              const sign = dAng >= 0 ? 1 : -1;
              const angOverlap = (minAng - Math.abs(dAng));
              const lateral = tangentA.multiplyScalar(sign * angOverlap * 1.2); // strong push
              a.mesh.position.x += lateral.x;
              a.mesh.position.z += lateral.z;
              b.mesh.position.x -= lateral.x;
              b.mesh.position.z -= lateral.z;
            }
          }
        }
      }
  // update rain and follow player
  rain.points.position.copy(player.position);
  rain.points.position.y = 0; // keep emitter zero-centered vertically
  rain.update(dt, now/1000);
  
      // Crazy mode effects
      if (crazyMode) {
        skyColorTimer += dt;
        if (skyColorTimer >= 0.5) {
          // Change sky to random bright color every 0.5 seconds
          const colors = [
            new THREE.Color(0xff0080), // hot pink
            new THREE.Color(0x00ff80), // bright green
            new THREE.Color(0x8000ff), // purple
            new THREE.Color(0xff8000), // orange
            new THREE.Color(0x0080ff), // bright blue
            new THREE.Color(0xffff00), // yellow
            new THREE.Color(0xff0040), // red-pink
            new THREE.Color(0x40ff00), // lime
          ];
          scene.background = colors[Math.floor(Math.random() * colors.length)];
          skyColorTimer = 0;
        }
      }
  
      renderer.render(scene, camera);
    }
    animate();

    window.addEventListener('resize', ()=>{ camera.aspect = window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); renderer.setSize(window.innerWidth, window.innerHeight); });
  }catch(e){
    logToServer({message: 'init error', error: String(e), stack: e.stack});
    throw e;
  }
})();
