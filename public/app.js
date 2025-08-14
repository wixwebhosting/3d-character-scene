// Basic Three.js scene with three "heads" and random dialog
(function(){
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0a0a0a);

  const camera = new THREE.PerspectiveCamera(60, window.innerWidth/window.innerHeight, 0.1, 1000);
  camera.position.set(0, 2.2, 10);

  const renderer = new THREE.WebGLRenderer({antialias:true});
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio ? window.devicePixelRatio : 1);
  document.getElementById('container').appendChild(renderer.domElement);

  // Controls
  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(0,1.2,0);
  controls.update();

  // Lights
  const dir = new THREE.DirectionalLight(0xffffff, 1.1);
  dir.position.set(5,10,7);
  scene.add(dir);
  scene.add(new THREE.AmbientLight(0x666666, 0.8));

  // Ground/Backdrop
  const texLoader = new THREE.TextureLoader();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(80,40), new THREE.MeshStandardMaterial({
    map: texLoader.load('https://threejsfundamentals.org/threejs/resources/images/wall.jpg')
  }));
  bg.rotation.x = -Math.PI/2;
  bg.position.set(0,-1.5,-12);
  scene.add(bg);

  const gltfLoader = new THREE.GLTFLoader();

  // We'll load three free head models from public CDNs (glTF). If unavailable, fallback to spheres.
  const modelUrls = [
    // public sample head models (low risk, permissive demo links)
    'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/BrainStem/glTF/BrainStem.gltf',
    'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/Monster/glTF/Monster.gltf',
    'https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Models/master/2.0/FaceCap/glTF/FaceCap.gltf'
  ];

  const heads = [];
  const positions = [-6, 0, 6];

  function makeFallback(index){
    const geo = new THREE.SphereGeometry(1.1, 48, 48);
    const mat = new THREE.MeshStandardMaterial({color: 0x888888, metalness:0.2, roughness:0.7});
    const m = new THREE.Mesh(geo, mat);
    m.position.set(positions[index], 1.6, 0);
    scene.add(m);
    heads.push({mesh: m, talk: (v)=>{ m.scale.y = 1+v*0.2; }});
  }

  // Load models in parallel
  modelUrls.forEach((url, i)=>{
    gltfLoader.load(url, (gltf)=>{
      const root = gltf.scene || gltf.scenes[0];
      root.traverse(n=>{ if(n.isMesh){ n.castShadow=true; n.receiveShadow=true;} });

      // Normalize size
      const box = new THREE.Box3().setFromObject(root);
      const size = box.getSize(new THREE.Vector3()).length();
      const scale = 2.5 / size;
      root.scale.setScalar(scale);
      root.position.set(positions[i], 0.6, 0);

      // try to find jaw bone or morph target to animate mouth
      let talkFn = null;
      // Morph target approach
      let meshWithMorph = null;
      root.traverse((n)=>{ if(n.isMesh && n.morphTargetInfluences){ meshWithMorph = n; }});
      if(meshWithMorph){
        talkFn = (v)=>{ meshWithMorph.morphTargetInfluences[0] = v; };
      } else {
        // bone approach: find a node named 'Jaw' or 'jaw' or 'Head'
        let jaw = null;
        root.traverse(n=>{ if(n.isBone && /jaw|Jaw|LowerJaw/i.test(n.name)) jaw = n; });
        if(jaw){
          talkFn = (v)=>{ jaw.rotation.x = -v*0.6; };
        }
      }

      if(!talkFn){
        // fallback scale to simulate mouth movement
        talkFn = (v)=>{ root.scale.y = 1 + v*0.12; };
      }

      scene.add(root);
      heads.push({mesh: root, talk: talkFn});
    }, undefined, (err)=>{
      console.warn('Model failed to load', url, err);
      makeFallback(i);
    });
  });

  // Simulate talking by animating talk() parameter
  function simulateTalking(){
    if(heads.length === 0) return;
    const idx = Math.floor(Math.random()*heads.length);
    const h = heads[idx];
    // short envelope
    const start = performance.now();
    const dur = 800 + Math.random()*1000;
    function step(){
      const t = (performance.now()-start)/dur;
      if(t >= 1){ h.talk(0); return; }
      // amplitude envelope
      const amp = Math.max(0, Math.sin(t*Math.PI*3) * (1 - t));
      h.talk(amp);
      requestAnimationFrame(step);
    }
    step();
  }
  setInterval(simulateTalking, 1200);

  // Animation/render loop
  function animate(){
    requestAnimationFrame(animate);
    // subtle idle
    heads.forEach((h,i)=>{
      if(h.mesh) h.mesh.rotation.y = Math.sin(Date.now()*0.0004 + i)*0.12;
    });
    renderer.render(scene, camera);
  }
  animate();

  // Resize
  window.addEventListener('resize', ()=>{
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
})();
