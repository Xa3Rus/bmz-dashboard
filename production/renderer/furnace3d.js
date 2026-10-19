// Промышленный 3D-цифровой двойник дуговой сталеплавильной печи ДСП-135 (ЭСПЦ-2 ОАО «БМЗ»)
// Загрузка 3D-модели Blender / glTF 2.0 (models/dsp135.glb) и анимация узлов в реальном времени от телеметрии ПЛК

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class Furnace3D {
  constructor(containerId) {
    this.container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!this.container) return;
    window.furnace3D = this;

    this.mode = 'cutaway'; // 'cutaway' | 'shell' | 'thermal' | 'wireframe'
    this.autoRotate = false;
    this.glbLoaded = false;
    this.arcGlows = [];
    this.arcHalos = [];
    this.arcLights = [];
    this.params = {
      temp_c: 1580,
      power_mw: 38,
      stage: 'Плавление',
      t_min: 18,
      duration_min: 65
    };

    this.cameraState = {
      rotX: 0.32,
      rotY: 0.72,
      dist: 17.5,
      targetRotX: 0.32,
      targetRotY: 0.72,
      targetDist: 17.5,
      panX: 0.1,
      panY: 0.75,
      targetPanX: 0.1,
      targetPanY: 0.75,
      isDragging: false,
      isPanning: false,
      lastMouseX: 0,
      lastMouseY: 0
    };

    this.currentTilt = 0;
    this.targetTilt = 0;
    this.currentRoofSwing = 0;
    this.targetRoofSwing = 0;
    this.targetElectrodeY = 0;

    this.showSensors = false;
    this.sensorPins = [
      { id: 'roof', title: 'Свод печи / Газоход', pos: new THREE.Vector3(0.0, 3.4, 0.0), render: p => `${Math.round((p.temp_c || 1580) * 0.45)} °C · 42 Па` },
      { id: 'water', title: 'Охлаждение кожуха', pos: new THREE.Vector3(3.2, 1.2, 0.8), render: p => `1840 м³/ч · ΔT 8.5 °C` },
      { id: 'electrodes', title: 'Электроды (3Ф)', pos: new THREE.Vector3(0.0, 5.2, -1.8), render: p => `${p.power_mw ? Math.round(p.power_mw * 1.15) : 0} кА · ${(p.power_mw || 0).toFixed(1)} МВт` },
      { id: 'ebt', title: 'Эркер выпуска (EBT)', pos: new THREE.Vector3(0.0, -0.6, 3.4), render: p => `Шибер: ${p.stage === 'Выпуск' ? 'ОТКРЫТ' : 'ЗАКРЫТ'} · ${p.temp_c || 1610} °C` }
    ];

    this.initScene();
    this.initProceduralTextures();
    this.initMaterials();
    this.initSensorOverlay();
    this.loadBlenderGlbModel('models/dsp135.glb');
    this.setupEvents();

    this.lastTime = performance.now();
    this.startTime = performance.now();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  initSensorOverlay() {
    this.sensorOverlay = document.createElement('div');
    this.sensorOverlay.className = 'sensor-pin-overlay';
    this.sensorOverlay.style.display = 'none';
    this.container.style.position = 'relative';
    this.container.appendChild(this.sensorOverlay);

    this.sensorPinElements = this.sensorPins.map(pin => {
      const el = document.createElement('div');
      el.className = 'sensor-pin';
      el.innerHTML = `
        <div class="sensor-pin-dot"></div>
        <div class="sensor-pin-card">
          <div class="s-title">${pin.title}</div>
          <div class="s-val" id="sVal-${pin.id}">—</div>
        </div>
      `;
      this.sensorOverlay.appendChild(el);
      return { pin, el, valEl: el.querySelector(`#sVal-${pin.id}`) };
    });
  }

  toggleSensors() {
    this.showSensors = !this.showSensors;
    if (this.sensorOverlay) {
      this.sensorOverlay.style.display = this.showSensors ? 'block' : 'none';
    }
    return this.showSensors;
  }

  updateSensorOverlayPositions() {
    if (!this.showSensors || !this.camera || !this.renderer) return;
    const width = this.container.clientWidth;
    const height = this.container.clientHeight;
    if (!width || !height) return;

    const tempV = new THREE.Vector3();
    this.sensorPinElements.forEach(item => {
      tempV.copy(item.pin.pos);
      if (this.tiltPivot && item.pin.id !== 'roof' && item.pin.id !== 'electrodes') {
        tempV.applyEuler(this.tiltPivot.rotation);
      }
      tempV.project(this.camera);

      // Проверка видимости перед камерой
      if (tempV.z > 1.0) {
        item.el.style.opacity = '0';
        return;
      }

      item.el.style.opacity = '1';
      const x = (tempV.x * 0.5 + 0.5) * width;
      const y = (-(tempV.y * 0.5) + 0.5) * height;
      item.el.style.left = `${x}px`;
      item.el.style.top = `${y}px`;
      if (item.valEl) {
        item.valEl.textContent = item.pin.render(this.params);
      }
    });
  }

  // ============================================================================
  // 1. ИНИЦИАЛИЗАЦИЯ СЦЕНЫ И ОСВЕЩЕНИЯ
  // ============================================================================
  initScene() {
    const width = this.container.clientWidth || 860;
    const height = this.container.clientHeight || 520;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x181a1d);
    this.scene.fog = new THREE.FogExp2(0x181a1d, 0.015);

    this.camera = new THREE.PerspectiveCamera(36, width / height, 0.2, 140);
    this.updateCameraPos();

    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance'
    });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.35;

    this.container.innerHTML = '';
    this.container.appendChild(this.renderer.domElement);

    const hemiLight = new THREE.HemisphereLight(0xe4e6e8, 0x2e3034, 1.3);
    hemiLight.position.set(0, 25, 0);
    this.scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffaf0, 2.5);
    keyLight.position.set(14, 24, 16);
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.width = 2048;
    keyLight.shadow.mapSize.height = 2048;
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 55;
    const d = 11;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0004;
    this.scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x9ca3af, 1.4);
    rimLight.position.set(-16, 14, -14);
    this.scene.add(rimLight);

    const frontFillLight = new THREE.DirectionalLight(0xb0b5ba, 1.0);
    frontFillLight.position.set(8, 6, 18);
    this.scene.add(frontFillLight);

    const underLight = new THREE.DirectionalLight(0xd97706, 0.55);
    underLight.position.set(4, -10, 8);
    this.scene.add(underLight);

    this.bathGlowLight = new THREE.PointLight(0xff5500, 4.2, 13, 1.4);
    this.bathGlowLight.position.set(0, 0.8, 0);
    this.scene.add(this.bathGlowLight);
  }

  // ============================================================================
  // 2. ИНЖЕНЕРНЫЕ ТЕКСТУРЫ И PBR-МАТЕРИАЛЫ
  // ============================================================================
  initProceduralTextures() {
    // 1. Текстура огнеупорной магнезитоуглеродистой кирпичной кладки
    const brickCanvas = document.createElement('canvas');
    brickCanvas.width = 512;
    brickCanvas.height = 512;
    const bCtx = brickCanvas.getContext('2d');
    bCtx.fillStyle = '#4a2515';
    bCtx.fillRect(0, 0, 512, 512);

    const rows = 16;
    const cols = 8;
    const rowH = 512 / rows;
    const colW = 512 / cols;

    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (colW / 2);
      for (let c = -1; c <= cols; c++) {
        const x = c * colW + offset;
        const y = r * rowH;
        const shade = 65 + Math.floor(Math.random() * 28);
        bCtx.fillStyle = `rgb(${shade + 35}, ${Math.floor(shade * 0.62)}, ${Math.floor(shade * 0.42)})`;
        bCtx.fillRect(x + 2, y + 2, colW - 4, rowH - 4);
      }
    }
    this.brickTexture = new THREE.CanvasTexture(brickCanvas);
    this.brickTexture.wrapS = THREE.RepeatWrapping;
    this.brickTexture.wrapT = THREE.RepeatWrapping;
    this.brickTexture.repeat.set(4, 2);

    // 2. Текстура водоохлаждаемых трубчатых панелей
    const pipeCanvas = document.createElement('canvas');
    pipeCanvas.width = 256;
    pipeCanvas.height = 256;
    const pCtx = pipeCanvas.getContext('2d');
    const pipes = 16;
    const pH = 256 / pipes;
    for (let i = 0; i < pipes; i++) {
      const grad = pCtx.createLinearGradient(0, i * pH, 0, (i + 1) * pH);
      grad.addColorStop(0.0, '#1f2833');
      grad.addColorStop(0.25, '#4b5d70');
      grad.addColorStop(0.5, '#647b91');
      grad.addColorStop(0.8, '#384756');
      grad.addColorStop(1.0, '#182028');
      pCtx.fillStyle = grad;
      pCtx.fillRect(0, i * pH, 256, pH);
    }
    this.pipeTexture = new THREE.CanvasTexture(pipeCanvas);
    this.pipeTexture.wrapS = THREE.RepeatWrapping;
    this.pipeTexture.wrapT = THREE.RepeatWrapping;
    this.pipeTexture.repeat.set(6, 2);

    // 3. Текстура жидкого металла и шлака
    const meltCanvas = document.createElement('canvas');
    meltCanvas.width = 512;
    meltCanvas.height = 512;
    const mCtx = meltCanvas.getContext('2d');
    const radGrad = mCtx.createRadialGradient(256, 256, 20, 256, 256, 256);
    radGrad.addColorStop(0.0, '#fff3b0');
    radGrad.addColorStop(0.35, '#ff9e00');
    radGrad.addColorStop(0.7, '#e85d04');
    radGrad.addColorStop(0.92, '#6a040f');
    radGrad.addColorStop(1.0, '#2b1d1a');
    mCtx.fillStyle = radGrad;
    mCtx.fillRect(0, 0, 512, 512);

    for (let i = 0; i < 90; i++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 90 + Math.random() * 145;
      const sx = 256 + Math.cos(ang) * dist;
      const sy = 256 + Math.sin(ang) * dist;
      const sr = 4 + Math.random() * 14;
      mCtx.fillStyle = `rgba(35, 22, 18, ${0.35 + Math.random() * 0.45})`;
      mCtx.beginPath();
      mCtx.arc(sx, sy, sr, 0, Math.PI * 2);
      mCtx.fill();
    }
    this.meltTexture = new THREE.CanvasTexture(meltCanvas);

    // 4. Текстура стального рифленого настила
    const grateCanvas = document.createElement('canvas');
    grateCanvas.width = 128;
    grateCanvas.height = 128;
    const gCtx = grateCanvas.getContext('2d');
    gCtx.fillStyle = '#242e3b';
    gCtx.fillRect(0, 0, 128, 128);
    gCtx.strokeStyle = '#364558';
    gCtx.lineWidth = 2;
    for (let i = 0; i <= 128; i += 16) {
      gCtx.beginPath(); gCtx.moveTo(i, 0); gCtx.lineTo(i, 128); gCtx.stroke();
      gCtx.beginPath(); gCtx.moveTo(0, i); gCtx.lineTo(128, i); gCtx.stroke();
    }
    this.grateTexture = new THREE.CanvasTexture(grateCanvas);
    this.grateTexture.wrapS = THREE.RepeatWrapping;
    this.grateTexture.wrapT = THREE.RepeatWrapping;
    this.grateTexture.repeat.set(16, 16);
  }

  initMaterials() {
    this.materials = {
      heavySteel: new THREE.MeshStandardMaterial({
        color: 0x5c6066,
        roughness: 0.44,
        metalness: 0.56
      }),
      darkSteel: new THREE.MeshStandardMaterial({
        color: 0x3b3e42,
        roughness: 0.5,
        metalness: 0.52
      }),
      structuralBeam: new THREE.MeshStandardMaterial({
        color: 0x45494f,
        roughness: 0.5,
        metalness: 0.48
      }),
      coolingPanel: new THREE.MeshStandardMaterial({
        color: 0x666c73,
        map: this.pipeTexture,
        bumpMap: this.pipeTexture,
        bumpScale: 0.035,
        roughness: 0.4,
        metalness: 0.6
      }),
      copperWaterPipe: new THREE.MeshStandardMaterial({
        color: 0x56768a,
        roughness: 0.38,
        metalness: 0.55
      }),
      copperBus: new THREE.MeshStandardMaterial({
        color: 0xc87846,
        roughness: 0.3,
        metalness: 0.75
      }),
      chromeRod: new THREE.MeshStandardMaterial({
        color: 0xdcdcdc,
        roughness: 0.2,
        metalness: 0.82
      }),
      refractoryBrick: new THREE.MeshStandardMaterial({
        color: 0xb5653b,
        map: this.brickTexture,
        bumpMap: this.brickTexture,
        bumpScale: 0.04,
        roughness: 0.85,
        metalness: 0.06
      }),
      refractoryCastable: new THREE.MeshStandardMaterial({
        color: 0x82553a,
        roughness: 0.9,
        metalness: 0.05
      }),
      rammingMass: new THREE.MeshStandardMaterial({
        color: 0x633f2b,
        roughness: 0.92,
        metalness: 0.04
      }),
      graphite: new THREE.MeshStandardMaterial({
        color: 0x282a2d,
        roughness: 0.55,
        metalness: 0.35
      }),
      electrodeTipHot: new THREE.MeshStandardMaterial({
        color: 0x221c1a,
        emissive: 0xff4500,
        emissiveIntensity: 0.6,
        roughness: 0.5,
        metalness: 0.2
      }),
      concrete: new THREE.MeshStandardMaterial({
        color: 0x242629,
        roughness: 0.95,
        metalness: 0.08
      }),
      platformGrate: new THREE.MeshStandardMaterial({
        color: 0x2f3237,
        map: this.grateTexture,
        roughness: 0.7,
        metalness: 0.55
      }),
      safetyRail: new THREE.MeshStandardMaterial({
        color: 0x946b22,
        roughness: 0.5,
        metalness: 0.4
      }),
      meltSurface: new THREE.MeshStandardMaterial({
        color: 0xffaa00,
        map: this.meltTexture,
        emissive: 0xff5500,
        emissiveMap: this.meltTexture,
        emissiveIntensity: 1.5,
        roughness: 0.22,
        metalness: 0.25
      }),
      meltSection: new THREE.MeshStandardMaterial({
        color: 0xff6b00,
        emissive: 0xe84800,
        emissiveIntensity: 1.35,
        roughness: 0.3,
        metalness: 0.2
      }),
      slagLayer: new THREE.MeshStandardMaterial({
        color: 0x261a15,
        emissive: 0x5c1900,
        emissiveIntensity: 0.35,
        roughness: 0.88,
        metalness: 0.15
      }),
      arcPlasma: new THREE.MeshBasicMaterial({
        color: 0xfff5e6,
        transparent: true,
        opacity: 0.95
      }),
      arcHalo: new THREE.MeshBasicMaterial({
        color: 0xffb366,
        transparent: true,
        opacity: 0.35,
        side: THREE.DoubleSide
      }),
      edgeLine: new THREE.LineBasicMaterial({
        color: 0x70757d,
        transparent: true,
        opacity: 0.24
      }),
      shopFloor: new THREE.MeshStandardMaterial({
        color: 0x141618,
        roughness: 0.95,
        metalness: 0.08
      })
    };

    Object.entries(this.materials).forEach(([key, mat]) => {
      mat.name = key;
      mat.userData = { matKey: key };
    });
  }

  addCadEdges(mesh, threshold = 28) {
    if (!mesh || !mesh.geometry) return mesh;
    const edgesGeo = new THREE.EdgesGeometry(mesh.geometry, threshold);
    const line = new THREE.LineSegments(edgesGeo, this.materials.edgeLine);
    line.name = 'CAD_Edge';
    line.userData = { isCadEdge: true };
    mesh.add(line);
    return mesh;
  }

  // ============================================================================
  // 3. ЗАГРУЗКА 3D-МОДЕЛИ BLENDER / GLTF 2.0 (models/dsp135.glb)
  // ============================================================================
  loadBlenderGlbModel(url = 'models/dsp135.glb') {
    this.transTerminals = [
      new THREE.Vector3(-1.15, 2.45, -4.75),
      new THREE.Vector3(0.0, 2.45, -4.75),
      new THREE.Vector3(1.15, 2.45, -4.75)
    ];
    this.cableArmAnchors = [
      new THREE.Vector3(-1.15, 4.55, -4.15),
      new THREE.Vector3(0.0, 4.55, -4.15),
      new THREE.Vector3(1.15, 4.55, -4.15)
    ];

    const loader = new GLTFLoader();
    loader.load(url, gltf => {
      this.bindLoadedGlbScene(gltf.scene);
    });
  }

  bindLoadedGlbScene(gltfRoot) {
    if (this.envGroup) this.scene.remove(this.envGroup);
    if (this.tiltPivot) this.scene.remove(this.tiltPivot);
    if (this.cablesGroup) this.scene.remove(this.cablesGroup);
    if (this.tappingStream) this.scene.remove(this.tappingStream);

    this.arcGlows = [];
    this.arcHalos = [];
    this.arcLights = [];

    const meshesToEdge = [];

    gltfRoot.traverse(node => {
      if (node.name === 'Shop_Environment') this.envGroup = node;
      if (node.name === 'Furnace_Tilt_Group') this.tiltPivot = node;
      if (node.name === 'Furnace_Root') this.furnaceRoot = node;
      if (node.name === 'Rocker_Cradle') this.cradleGroup = node;
      if (node.name === 'Shell_Full') this.shellFull = node;
      if (node.name === 'Shell_Cut') this.shellCut = node;
      if (node.name === 'Bath_Group') this.bathGroup = node;
      if (node.name === 'Liquid_Bath_Body') this.meltBody = node;
      if (node.name === 'Liquid_Bath') this.meltSurface = node;
      if (node.name === 'Slag_Ring') this.slagRing = node;
      if (node.name === 'Scrap_Group') this.scrapGroup = node;
      if (node.name === 'Roof_Swing_Pivot') this.roofSwingPivot = node;
      if (node.name === 'Roof_Assembly') this.roofGroup = node;
      if (node.name === 'Gantry_Base') this.gantryBase = node;
      if (node.name === 'Electrode_Group') this.electrodeGroup = node;

      if (node.isMesh) {
        const matKey = (node.userData && node.userData.matKey) || (node.material && node.material.name);
        if (matKey && this.materials[matKey]) {
          if (matKey === 'arcPlasma' || matKey === 'arcHalo') {
            node.material = this.materials[matKey].clone();
          } else {
            node.material = this.materials[matKey];
          }
        }
        if (node.userData) {
          if (node.userData.castShadow !== undefined) node.castShadow = Boolean(node.userData.castShadow);
          if (node.userData.receiveShadow !== undefined) node.receiveShadow = Boolean(node.userData.receiveShadow);
          if (node.userData.hasCadEdges) {
            meshesToEdge.push({ mesh: node, threshold: node.userData.edgeThreshold || 28 });
          }
        }
      }
    });

    ['Arc_1', 'Arc_2', 'Arc_3'].forEach(n => {
      const m = gltfRoot.getObjectByName(n);
      if (m) this.arcGlows.push(m);
    });
    ['Arc_Halo_1', 'Arc_Halo_2', 'Arc_Halo_3'].forEach(n => {
      const m = gltfRoot.getObjectByName(n);
      if (m) this.arcHalos.push(m);
    });

    meshesToEdge.forEach(({ mesh, threshold }) => this.addCadEdges(mesh, threshold));

    if (this.envGroup) {
      this.scene.add(this.envGroup);
      const grid = new THREE.GridHelper(32, 32, 0x32353b, 0x202226);
      grid.name = 'Shop_Grid';
      grid.position.y = -4.29;
      this.envGroup.add(grid);
    }

    if (this.tiltPivot) {
      this.scene.add(this.tiltPivot);
    }

    if (this.furnaceRoot) {
      const deltaRad = 0.86;
      [Math.PI / 2 + (Math.PI * 2) / 3, Math.PI / 2, Math.PI / 2 + (Math.PI * 4) / 3].forEach(ang => {
        const ex = Math.cos(ang) * deltaRad;
        const ez = Math.sin(ang) * deltaRad;
        const arcLight = new THREE.PointLight(0xa3e5ff, 0, 7.5, 1.7);
        arcLight.position.set(ex, 0.45, ez);
        this.furnaceRoot.add(arcLight);
        this.arcLights.push(arcLight);
      });
    }

    this.buildFlexibleCables();
    this.buildTappingStream();

    this.glbLoaded = true;
    this.applyMode();
    this.update(this.params);
  }

  // Гибкие водоохлаждаемые кабели короткой сети
  buildFlexibleCables() {
    this.cablesGroup = new THREE.Group();
    this.scene.add(this.cablesGroup);
    this.cableMeshes = [];

    for (let phase = 0; phase < 3; phase++) {
      [-0.11, 0.11].forEach(offsetX => {
        const dummyCurve = new THREE.CatmullRomCurve3([
          new THREE.Vector3(0, 0, 0),
          new THREE.Vector3(0, -1, 0),
          new THREE.Vector3(0, 0, 1)
        ]);
        const geo = new THREE.TubeGeometry(dummyCurve, 20, 0.068, 10, false);
        const mesh = new THREE.Mesh(geo, this.materials.darkSteel);
        mesh.castShadow = true;
        this.cablesGroup.add(mesh);
        this.cableMeshes.push({ phase, offsetX, mesh });
      });
    }
    this.updateFlexibleCables();
  }

  updateFlexibleCables() {
    if (!this.cableMeshes || !this.transTerminals || !this.cableArmAnchors || !this.electrodeGroup || !this.furnaceRoot) return;

    this.cableMeshes.forEach(item => {
      const { phase, offsetX, mesh } = item;
      const pStart = this.transTerminals[phase].clone();
      pStart.x += offsetX;

      const localAnchor = this.cableArmAnchors[phase].clone();
      localAnchor.y += this.electrodeGroup.position.y;
      this.furnaceRoot.updateMatrixWorld();
      const pEnd = localAnchor.applyMatrix4(this.furnaceRoot.matrixWorld);
      pEnd.x += offsetX;

      const pMid1 = new THREE.Vector3().lerpVectors(pStart, pEnd, 0.33);
      pMid1.y -= 1.35;
      pMid1.z -= 0.25;

      const pMid2 = new THREE.Vector3().lerpVectors(pStart, pEnd, 0.67);
      pMid2.y -= 1.15;

      const curve = new THREE.CatmullRomCurve3([pStart, pMid1, pMid2, pEnd]);
      const newGeo = new THREE.TubeGeometry(curve, 22, 0.068, 10, false);
      mesh.geometry.dispose();
      mesh.geometry = newGeo;
    });
  }

  // Струя жидкой стали при выпуске плавки из эркера EBT в ковш
  buildTappingStream() {
    const streamCurve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-3.55, 1.0, 0),
      new THREE.Vector3(-4.15, -0.4, 0),
      new THREE.Vector3(-4.55, -2.2, 0)
    ]);
    const streamGeo = new THREE.TubeGeometry(streamCurve, 16, 0.13, 12, false);
    this.tappingStream = new THREE.Mesh(streamGeo, this.materials.meltSurface);
    this.tappingStream.visible = false;
    this.scene.add(this.tappingStream);
  }

  // ============================================================================
  // 4. СОБЫТИЯ МЫШИ И КАМЕРЫ
  // ============================================================================
  setupEvents() {
    const dom = this.renderer.domElement;

    dom.addEventListener('contextmenu', e => e.preventDefault());

    dom.addEventListener('mousedown', e => {
      this.cameraState.isDragging = e.button === 0 && !e.shiftKey;
      this.cameraState.isPanning = e.button === 2 || (e.button === 0 && e.shiftKey);
      this.cameraState.lastMouseX = e.clientX;
      this.cameraState.lastMouseY = e.clientY;
      dom.style.cursor = this.cameraState.isPanning ? 'move' : 'grabbing';
    });

    window.addEventListener('mouseup', () => {
      this.cameraState.isDragging = false;
      this.cameraState.isPanning = false;
      if (dom) dom.style.cursor = 'grab';
    });

    window.addEventListener('mousemove', e => {
      if (!this.cameraState.isDragging && !this.cameraState.isPanning) return;

      const dx = e.clientX - this.cameraState.lastMouseX;
      const dy = e.clientY - this.cameraState.lastMouseY;
      this.cameraState.lastMouseX = e.clientX;
      this.cameraState.lastMouseY = e.clientY;

      if (this.cameraState.isPanning) {
        this.cameraState.targetPanX -= dx * 0.014;
        this.cameraState.targetPanY += dy * 0.014;
      } else {
        this.cameraState.targetRotY += dx * 0.0065;
        this.cameraState.targetRotX = Math.max(-0.08, Math.min(1.25, this.cameraState.targetRotX + dy * 0.0065));
      }
    });

    dom.addEventListener('wheel', e => {
      e.preventDefault();
      const zoom = e.deltaY * 0.011;
      this.cameraState.targetDist = Math.max(7.5, Math.min(28.0, this.cameraState.targetDist + zoom));
    }, { passive: false });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
  }

  resize() {
    if (!this.container || !this.renderer || !this.camera) return;
    const width = this.container.clientWidth || 860;
    const height = this.container.clientHeight || 520;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
  }

  updateCameraPos() {
    const { rotX, rotY, dist, panX, panY } = this.cameraState;
    const cx = Math.sin(rotY) * Math.cos(rotX) * dist + panX;
    const cy = Math.sin(rotX) * dist + 0.5 + panY;
    const cz = Math.cos(rotY) * Math.cos(rotX) * dist;
    this.camera.position.set(cx, cy, cz);
    this.camera.lookAt(panX, 0.5 + panY, 0);
  }

  // ============================================================================
  // 5. РЕЖИМЫ ВИЗУАЛИЗАЦИИ (РАЗРЕЗ / КОРПУС / ТЕРМОКАРТА / КАРКАС)
  // ============================================================================
  setMode(mode) {
    this.mode = mode;
    this.applyMode();
  }

  applyMode() {
    const isCut = this.mode === 'cutaway';
    const isThermal = this.mode === 'thermal';
    const isWireframe = this.mode === 'wireframe';

    if (this.shellFull) this.shellFull.visible = !isCut;
    if (this.shellCut) this.shellCut.visible = isCut;

    [
      this.materials.heavySteel,
      this.materials.coolingPanel,
      this.materials.refractoryBrick,
      this.materials.structuralBeam
    ].forEach(mat => {
      mat.wireframe = isWireframe;
    });

    if (isThermal) {
      this.materials.heavySteel.color.setHex(0x1f306e);
      this.materials.heavySteel.emissive.setHex(0x0b1338);
      this.materials.coolingPanel.color.setHex(0xd9381e);
      this.materials.coolingPanel.emissive.setHex(0x6e1405);
      this.materials.coolingPanel.emissiveIntensity = 0.65;
      this.materials.structuralBeam.color.setHex(0x131d38);
      this.materials.copperBus.emissive.setHex(0x802b00);
      this.materials.copperBus.emissiveIntensity = 0.5;
    } else {
      this.materials.heavySteel.color.setHex(0x5c6066);
      this.materials.heavySteel.emissive.setHex(0x000000);
      this.materials.coolingPanel.color.setHex(0x666c73);
      this.materials.coolingPanel.emissive.setHex(0x000000);
      this.materials.coolingPanel.emissiveIntensity = 0.0;
      this.materials.structuralBeam.color.setHex(0x45494f);
      this.materials.copperBus.emissive.setHex(0x000000);
      this.materials.copperBus.emissiveIntensity = 0.0;
    }
  }

  toggleAutoRotate() {
    this.autoRotate = !this.autoRotate;
    return this.autoRotate;
  }

  resetCamera() {
    this.cameraState.targetRotX = 0.32;
    this.cameraState.targetRotY = 0.72;
    this.cameraState.targetDist = 17.5;
    this.cameraState.targetPanX = 0.1;
    this.cameraState.targetPanY = 0.75;
  }

  // ============================================================================
  // 6. ОБНОВЛЕНИЕ СОСТОЯНИЯ ПЕЧИ ОТ ТЕЛЕМЕТРИИ ПЛАВКИ
  // ============================================================================
  update(data = {}) {
    this.params = { ...this.params, ...data };
    const { temp_c, power_mw, stage } = this.params;

    const t = Math.max(25, Math.min(1750, temp_c || 1550));
    const normT = Math.max(0, Math.min(1, (t - 500) / 1200));

    const coldColor = new THREE.Color(0x5a1807);
    const hotColor = new THREE.Color(0xffaa00);
    const currentColor = new THREE.Color().lerpColors(coldColor, hotColor, normT);

    this.materials.meltSurface.color.copy(currentColor);
    this.materials.meltSurface.emissive.copy(currentColor);
    this.materials.meltSurface.emissiveIntensity = 0.25 + normT * 1.65;

    this.materials.meltSection.color.copy(currentColor);
    this.materials.meltSection.emissive.copy(currentColor);
    this.materials.meltSection.emissiveIntensity = 0.2 + normT * 1.3;

    if (this.bathGlowLight) {
      this.bathGlowLight.intensity = 0.5 + normT * 4.2;
      this.bathGlowLight.color.copy(currentColor);
    }

    if (stage === 'Завалка') {
      this.targetElectrodeY = 1.35;
      this.targetRoofSwing = 0.52;
      this.targetTilt = 0;
      if (this.scrapGroup) {
        this.scrapGroup.visible = true;
        this.scrapGroup.scale.set(1, 1, 1);
      }
      if (this.tappingStream) this.tappingStream.visible = false;
    } else if (stage === 'Плавление') {
      this.targetElectrodeY = -0.32;
      this.targetRoofSwing = 0;
      this.targetTilt = 0;
      if (this.scrapGroup) {
        const meltFactor = Math.max(0, 1 - Math.max(0, (t - 950) / 600));
        this.scrapGroup.visible = meltFactor > 0.08;
        this.scrapGroup.scale.set(1, Math.max(0.1, meltFactor), 1);
      }
      if (this.tappingStream) this.tappingStream.visible = false;
    } else if (stage === 'Доводка') {
      this.targetElectrodeY = -0.12;
      this.targetRoofSwing = 0;
      this.targetTilt = -0.035;
      if (this.scrapGroup) this.scrapGroup.visible = false;
      if (this.tappingStream) this.tappingStream.visible = false;
    } else if (stage === 'Выпуск') {
      this.targetElectrodeY = 1.25;
      this.targetRoofSwing = 0;
      this.targetTilt = 0.16;
      if (this.scrapGroup) this.scrapGroup.visible = false;
      if (this.tappingStream) this.tappingStream.visible = true;
    }

    const isArcOn = power_mw > 1.0 && (stage === 'Плавление' || stage === 'Доводка');
    this.isArcActive = isArcOn;
    this.arcPowerNorm = Math.min(1.0, (power_mw || 0) / 48);

    this.arcGlows.forEach(core => { core.visible = isArcOn; });
    this.arcHalos.forEach(halo => { halo.visible = isArcOn; });
    if (!isArcOn) {
      this.arcLights.forEach(l => { l.intensity = 0; });
      this.materials.electrodeTipHot.emissiveIntensity = normT * 0.6;
    } else {
      this.materials.electrodeTipHot.emissiveIntensity = 1.6 + this.arcPowerNorm * 1.4;
    }
  }

  // ============================================================================
  // 7. ЦИКЛ АНИМАЦИИ (60 FPS)
  // ============================================================================
  animate() {
    requestAnimationFrame(this.animate);

    const now = performance.now();
    const time = (now - this.startTime) / 1000;
    this.lastTime = now;

    const s = this.cameraState;
    if (this.autoRotate && !s.isDragging && !s.isPanning) {
      s.targetRotY += 0.0035;
    }
    s.rotX += (s.targetRotX - s.rotX) * 0.12;
    s.rotY += (s.targetRotY - s.rotY) * 0.12;
    s.dist += (s.targetDist - s.dist) * 0.15;
    s.panX += (s.targetPanX - s.panX) * 0.15;
    s.panY += (s.targetPanY - s.panY) * 0.15;
    this.updateCameraPos();

    let cablesNeedUpdate = false;

    if (this.electrodeGroup && Math.abs(this.targetElectrodeY - this.electrodeGroup.position.y) > 0.002) {
      this.electrodeGroup.position.y += (this.targetElectrodeY - this.electrodeGroup.position.y) * 0.08;
      cablesNeedUpdate = true;
    }

    if (this.roofSwingPivot && Math.abs(this.targetRoofSwing - this.currentRoofSwing) > 0.002) {
      this.currentRoofSwing += (this.targetRoofSwing - this.currentRoofSwing) * 0.07;
      this.roofSwingPivot.rotation.y = this.currentRoofSwing;
    }

    if (this.tiltPivot && Math.abs(this.targetTilt - this.currentTilt) > 0.001) {
      this.currentTilt += (this.targetTilt - this.currentTilt) * 0.06;
      this.tiltPivot.rotation.z = this.currentTilt;
      cablesNeedUpdate = true;
    }

    if (cablesNeedUpdate) {
      this.updateFlexibleCables();
    }

    if (this.isArcActive) {
      const pNorm = this.arcPowerNorm || 0.7;
      this.arcGlows.forEach((core, idx) => {
        const flicker = 0.8 + Math.sin(time * 42 + idx * 2.1) * 0.25 + (Math.random() - 0.5) * 0.3;
        const scaleXZ = (0.85 + pNorm * 0.55) * flicker;
        core.scale.set(scaleXZ, 0.9 + Math.random() * 0.35, scaleXZ);
      });

      this.arcHalos.forEach((halo, idx) => {
        const pulse = 0.9 + Math.cos(time * 35 + idx * 2.0) * 0.22;
        halo.scale.setScalar((0.9 + pNorm * 0.6) * pulse);
      });

      this.arcLights.forEach((light, idx) => {
        const flicker = Math.sin(time * 48 + idx * 2.09) * 1.8 + (Math.random() - 0.5) * 2.2;
        light.intensity = Math.max(1.5, 4.5 + pNorm * 6.5 + flicker);
        light.color.setHex(Math.random() > 0.28 ? 0x9be2ff : 0xffe082);
      });
    }

    if (this.meltSurface) {
      this.meltSurface.rotation.y = time * 0.08;
      const pulse = 1.0 + Math.sin(time * 4.5) * 0.006;
      this.meltSurface.scale.set(pulse, 1, pulse);
    }

    this.updateSensorOverlayPositions();

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.remove();
    }
  }
}
