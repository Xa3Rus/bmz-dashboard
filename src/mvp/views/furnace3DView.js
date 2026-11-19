/**
 * ============================================================================
 * [V] MVP VIEW MODULE 2: src/mvp/views/furnace3DView.js
 * Назначение: Пассивное представление 3D-цифрового двойника печи ДСП-135
 *             (Three.js + GLTFLoader для models/dsp135.glb + OrbitControls)
 * ============================================================================
 * Роль в паттерне MVP:
 * 1. Инициализирует 3D-сцену Three.js, студийное освещение и OrbitControls.
 * 2. Загружает 3D-модель печи `models/dsp135.glb` и применяет процедурные PBR-материалы.
 * 3. По команде от Presenter включает оранжево-красное свечение перегрева (> 1650 °C)
 *    и переключает ракурсы камеры («Общий вид», «Свод печи», «Ванна расплава», «Сброс камеры»).
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class Furnace3DView {
  constructor() {
    this.dom = {
      viewport3D: document.getElementById('furnace3dViewport'),
      canvasContainer: document.getElementById('threeCanvasContainer'),
      overheatAlertBanner: document.getElementById('overheatAlertBanner'),
      overheatAlertTag: document.getElementById('overheatAlertTag'),
      overheatTempText: document.getElementById('overheatTempText'),
      hudFurnaceTitle: document.getElementById('hudFurnaceTitle'),
      hudResponsibleName: document.getElementById('hudResponsibleName'),
      hudArcPower: document.getElementById('hudArcPower'),
      hudWaterFlow: document.getElementById('hudWaterFlow'),
      cameraPresetBtns: document.querySelectorAll('[data-camera-preset]'),
      renderModeBtns: document.querySelectorAll('[data-render-mode]'),
      btnTogglePins: document.getElementById('btnTogglePins'),
      btnAutoRotate: document.getElementById('btnAutoRotate')
    };

    this.threeState = {
      scene: null,
      camera: null,
      renderer: null,
      controls: null,
      cameraTargetLerp: null,
      lookAtTargetLerp: null,
      renderMode: 'cutaway',
      isOverheated: false,
      currentTemp: 1585,
      currentPowerMw: 42.5,
      showPins: true,
      arcGlows: [],
      arcHalos: [],
      arcLights: [],
      startTime: performance.now()
    };

    this._initThreeJS();
  }

  bindCameraPresets(handler) {
    this.dom.cameraPresetBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const preset = btn.dataset.cameraPreset;
        this.dom.cameraPresetBtns.forEach(b => b.classList.toggle('active', b === btn));
        handler(preset);
      });
    });
  }

  bindRenderModes(handler) {
    this.dom.renderModeBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const mode = btn.dataset.renderMode;
        this.dom.renderModeBtns.forEach(b => b.classList.toggle('active', b === btn));
        handler(mode);
      });
    });

    this.dom.btnTogglePins?.addEventListener('click', () => {
      this.threeState.showPins = !this.threeState.showPins;
      this.dom.btnTogglePins.classList.toggle('active', this.threeState.showPins);
      if (this.sensorOverlay) {
        this.sensorOverlay.style.display = this.threeState.showPins ? 'block' : 'none';
      }
    });

    this.dom.btnAutoRotate?.addEventListener('click', () => {
      if (!this.threeState.controls) return;
      this.threeState.controls.autoRotate = !this.threeState.controls.autoRotate;
      this.dom.btnAutoRotate.classList.toggle('active', this.threeState.controls.autoRotate);
    });
  }

  _initThreeJS() {
    const container = this.dom.canvasContainer;
    if (!container) return;

    const width = container.clientWidth || 720;
    const height = container.clientHeight || 500;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x08090c);
    scene.fog = new THREE.FogExp2(0x08090c, 0.014);

    const camera = new THREE.PerspectiveCamera(36, width / height, 0.2, 150);
    camera.position.set(10.2, 6.2, 11.4);

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance'
    });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.32;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.07;
    controls.target.set(0, 1.25, 0);
    controls.minDistance = 6.5;
    controls.maxDistance = 28.0;
    controls.maxPolarAngle = Math.PI * 0.52;
    controls.autoRotate = false;
    controls.autoRotateSpeed = 0.8;

    const hemiLight = new THREE.HemisphereLight(0xe2e8f0, 0x1e222a, 1.35);
    hemiLight.position.set(0, 25, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfffaf0, 2.4);
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
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x38bdf8, 1.15);
    rimLight.position.set(-16, 14, -14);
    scene.add(rimLight);

    const frontFillLight = new THREE.DirectionalLight(0x94a3b8, 0.95);
    frontFillLight.position.set(8, 6, 18);
    scene.add(frontFillLight);

    const bathGlowLight = new THREE.PointLight(0xff5500, 4.2, 15, 1.4);
    bathGlowLight.position.set(0, 0.85, 0);
    scene.add(bathGlowLight);

    const overheatSpotLight = new THREE.PointLight(0xff2200, 0.0, 22, 1.2);
    overheatSpotLight.position.set(0, 2.8, 2.5);
    scene.add(overheatSpotLight);

    this.threeState.scene = scene;
    this.threeState.camera = camera;
    this.threeState.renderer = renderer;
    this.threeState.controls = controls;
    this.threeState.bathGlowLight = bathGlowLight;
    this.threeState.overheatSpotLight = overheatSpotLight;

    this._initProceduralTexturesAndMaterials();
    this._init3DSensorPins(container);
    this._loadGlbFurnaceModel('./models/dsp135.glb');

    this.resizeObserver = new ResizeObserver(() => this._onResize3D());
    this.resizeObserver.observe(container);

    this._animate3D = this._animate3D.bind(this);
    requestAnimationFrame(this._animate3D);
  }

  _initProceduralTexturesAndMaterials() {
    const brickCanvas = document.createElement('canvas');
    brickCanvas.width = 512;
    brickCanvas.height = 512;
    const bCtx = brickCanvas.getContext('2d');
    bCtx.fillStyle = '#4a2515';
    bCtx.fillRect(0, 0, 512, 512);
    const rows = 16, cols = 8;
    const rowH = 512 / rows, colW = 512 / cols;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (colW / 2);
      for (let c = -1; c <= cols; c++) {
        const shade = 65 + Math.floor(Math.random() * 28);
        bCtx.fillStyle = `rgb(${shade + 35}, ${Math.floor(shade * 0.62)}, ${Math.floor(shade * 0.42)})`;
        bCtx.fillRect(c * colW + offset + 2, r * rowH + 2, colW - 4, rowH - 4);
      }
    }
    const brickTexture = new THREE.CanvasTexture(brickCanvas);
    brickTexture.wrapS = THREE.RepeatWrapping;
    brickTexture.wrapT = THREE.RepeatWrapping;
    brickTexture.repeat.set(4, 2);

    const pipeCanvas = document.createElement('canvas');
    pipeCanvas.width = 256;
    pipeCanvas.height = 256;
    const pCtx = pipeCanvas.getContext('2d');
    const pipes = 16, pH = 256 / pipes;
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
    const pipeTexture = new THREE.CanvasTexture(pipeCanvas);
    pipeTexture.wrapS = THREE.RepeatWrapping;
    pipeTexture.wrapT = THREE.RepeatWrapping;
    pipeTexture.repeat.set(6, 2);

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
    const meltTexture = new THREE.CanvasTexture(meltCanvas);

    const grateCanvas = document.createElement('canvas');
    grateCanvas.width = 128;
    grateCanvas.height = 128;
    const gCtx = grateCanvas.getContext('2d');
    gCtx.fillStyle = '#1c222b';
    gCtx.fillRect(0, 0, 128, 128);
    gCtx.strokeStyle = '#2c3544';
    gCtx.lineWidth = 2;
    for (let i = 0; i <= 128; i += 16) {
      gCtx.beginPath(); gCtx.moveTo(i, 0); gCtx.lineTo(i, 128); gCtx.stroke();
      gCtx.beginPath(); gCtx.moveTo(0, i); gCtx.lineTo(128, i); gCtx.stroke();
    }
    const grateTexture = new THREE.CanvasTexture(grateCanvas);
    grateTexture.wrapS = THREE.RepeatWrapping;
    grateTexture.wrapT = THREE.RepeatWrapping;
    grateTexture.repeat.set(16, 16);

    this.materials = {
      heavySteel: new THREE.MeshStandardMaterial({ color: 0x5c6066, roughness: 0.44, metalness: 0.56 }),
      darkSteel: new THREE.MeshStandardMaterial({ color: 0x3b3e42, roughness: 0.5, metalness: 0.52 }),
      structuralBeam: new THREE.MeshStandardMaterial({ color: 0x45494f, roughness: 0.5, metalness: 0.48 }),
      coolingPanel: new THREE.MeshStandardMaterial({
        color: 0x666c73,
        map: pipeTexture,
        bumpMap: pipeTexture,
        bumpScale: 0.035,
        roughness: 0.4,
        metalness: 0.6
      }),
      copperWaterPipe: new THREE.MeshStandardMaterial({ color: 0x56768a, roughness: 0.38, metalness: 0.55 }),
      copperBus: new THREE.MeshStandardMaterial({ color: 0xc87846, roughness: 0.3, metalness: 0.75 }),
      chromeRod: new THREE.MeshStandardMaterial({ color: 0xdcdcdc, roughness: 0.2, metalness: 0.82 }),
      refractoryBrick: new THREE.MeshStandardMaterial({
        color: 0xb5653b,
        map: brickTexture,
        bumpMap: brickTexture,
        bumpScale: 0.04,
        roughness: 0.85,
        metalness: 0.06
      }),
      refractoryCastable: new THREE.MeshStandardMaterial({ color: 0x82553a, roughness: 0.9, metalness: 0.05 }),
      rammingMass: new THREE.MeshStandardMaterial({ color: 0x633f2b, roughness: 0.92, metalness: 0.04 }),
      graphite: new THREE.MeshStandardMaterial({ color: 0x282a2d, roughness: 0.55, metalness: 0.35 }),
      electrodeTipHot: new THREE.MeshStandardMaterial({
        color: 0x221c1a,
        emissive: 0xff4500,
        emissiveIntensity: 1.5,
        roughness: 0.5,
        metalness: 0.2
      }),
      concrete: new THREE.MeshStandardMaterial({ color: 0x202226, roughness: 0.95, metalness: 0.08 }),
      platformGrate: new THREE.MeshStandardMaterial({ color: 0x282c33, map: grateTexture, roughness: 0.7, metalness: 0.55 }),
      safetyRail: new THREE.MeshStandardMaterial({ color: 0x946b22, roughness: 0.5, metalness: 0.4 }),
      meltSurface: new THREE.MeshStandardMaterial({
        color: 0xffaa00,
        map: meltTexture,
        emissive: 0xff5500,
        emissiveMap: meltTexture,
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
      arcPlasma: new THREE.MeshBasicMaterial({ color: 0xfff5e6, transparent: true, opacity: 0.95 }),
      arcHalo: new THREE.MeshBasicMaterial({ color: 0xffb366, transparent: true, opacity: 0.35, side: THREE.DoubleSide }),
      edgeLine: new THREE.LineBasicMaterial({ color: 0x70757d, transparent: true, opacity: 0.22 }),
      shopFloor: new THREE.MeshStandardMaterial({ color: 0x0f1115, roughness: 0.95, metalness: 0.08 })
    };
  }

  _loadGlbFurnaceModel(modelUrl) {
    const loader = new GLTFLoader();
    loader.load(
      modelUrl,
      gltf => this._bindLoadedGlbScene(gltf.scene),
      undefined,
      err => {
        console.warn('GLB-модель не найдена, активирована встроенная 3D-модель ДСП:', err);
        this._buildProceduralFallbackFurnace();
      }
    );
  }

  _bindLoadedGlbScene(gltfRoot) {
    const scene = this.threeState.scene;
    const meshesToEdge = [];

    this.threeState.arcGlows = [];
    this.threeState.arcHalos = [];
    this.threeState.arcLights = [];

    gltfRoot.traverse(node => {
      if (node.name === 'Shop_Environment') this.envGroup = node;
      if (node.name === 'Furnace_Tilt_Group') this.tiltPivot = node;
      if (node.name === 'Furnace_Root') this.furnaceRoot = node;
      if (node.name === 'Shell_Full') this.shellFull = node;
      if (node.name === 'Shell_Cut') this.shellCut = node;
      if (node.name === 'Liquid_Bath') this.meltSurface = node;
      if (node.name === 'Electrode_Group') this.electrodeGroup = node;
      if (node.name === 'Scrap_Group') this.scrapGroup = node;

      if (node.isMesh) {
        const matKey = (node.userData && node.userData.matKey) || (node.material && node.material.name);
        if (matKey && this.materials[matKey]) {
          node.material = (matKey === 'arcPlasma' || matKey === 'arcHalo')
            ? this.materials[matKey].clone()
            : this.materials[matKey];
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

    ['Arc_1', 'Arc_2', 'Arc_3'].forEach(name => {
      const m = gltfRoot.getObjectByName(name);
      if (m) this.threeState.arcGlows.push(m);
    });
    ['Arc_Halo_1', 'Arc_Halo_2', 'Arc_Halo_3'].forEach(name => {
      const m = gltfRoot.getObjectByName(name);
      if (m) this.threeState.arcHalos.push(m);
    });

    meshesToEdge.forEach(({ mesh, threshold }) => {
      if (!mesh.geometry) return;
      const edgesGeo = new THREE.EdgesGeometry(mesh.geometry, threshold);
      const line = new THREE.LineSegments(edgesGeo, this.materials.edgeLine);
      mesh.add(line);
    });

    if (this.envGroup) {
      scene.add(this.envGroup);
      const grid = new THREE.GridHelper(32, 32, 0x1e2530, 0x13171f);
      grid.position.y = -4.29;
      this.envGroup.add(grid);
    }

    if (this.tiltPivot) {
      scene.add(this.tiltPivot);
    } else {
      scene.add(gltfRoot);
    }

    if (this.scrapGroup) {
      this.scrapGroup.visible = false;
    }

    if (this.furnaceRoot) {
      const deltaRad = 0.86;
      [Math.PI / 2 + (Math.PI * 2) / 3, Math.PI / 2, Math.PI / 2 + (Math.PI * 4) / 3].forEach(ang => {
        const arcLight = new THREE.PointLight(0xa3e5ff, 5.5, 7.5, 1.7);
        arcLight.position.set(Math.cos(ang) * deltaRad, 0.45, Math.sin(ang) * deltaRad);
        this.furnaceRoot.add(arcLight);
        this.threeState.arcLights.push(arcLight);
      });
    }

    this._buildFlexibleCables();
    this.set3DRenderMode(this.threeState.renderMode);
  }

  _buildFlexibleCables() {
    if (!this.furnaceRoot || !this.electrodeGroup) return;

    const scene = this.threeState.scene;
    const cablesGroup = new THREE.Group();
    scene.add(cablesGroup);

    const transTerminals = [
      new THREE.Vector3(-1.15, 2.45, -4.75),
      new THREE.Vector3(0.0, 2.45, -4.75),
      new THREE.Vector3(1.15, 2.45, -4.75)
    ];
    const cableArmAnchors = [
      new THREE.Vector3(-1.15, 4.55, -4.15),
      new THREE.Vector3(0.0, 4.55, -4.15),
      new THREE.Vector3(1.15, 4.55, -4.15)
    ];

    this.electrodeGroup.position.y = -0.25;
    this.furnaceRoot.updateMatrixWorld();

    for (let phase = 0; phase < 3; phase++) {
      [-0.11, 0.11].forEach(offsetX => {
        const pStart = transTerminals[phase].clone();
        pStart.x += offsetX;

        const pEnd = cableArmAnchors[phase].clone();
        pEnd.y += this.electrodeGroup.position.y;
        pEnd.applyMatrix4(this.furnaceRoot.matrixWorld);
        pEnd.x += offsetX;

        const pMid1 = new THREE.Vector3().lerpVectors(pStart, pEnd, 0.33);
        pMid1.y -= 1.35;
        pMid1.z -= 0.25;

        const pMid2 = new THREE.Vector3().lerpVectors(pStart, pEnd, 0.67);
        pMid2.y -= 1.15;

        const curve = new THREE.CatmullRomCurve3([pStart, pMid1, pMid2, pEnd]);
        const geo = new THREE.TubeGeometry(curve, 22, 0.068, 10, false);
        const mesh = new THREE.Mesh(geo, this.materials.darkSteel);
        mesh.castShadow = true;
        cablesGroup.add(mesh);
      });
    }
  }

  _buildProceduralFallbackFurnace() {
    const scene = this.threeState.scene;
    const group = new THREE.Group();

    const shellGeo = new THREE.CylinderGeometry(3.2, 2.8, 3.0, 32);
    const shellMesh = new THREE.Mesh(shellGeo, this.materials.coolingPanel);
    shellMesh.position.y = 0.8;
    group.add(shellMesh);

    const bathGeo = new THREE.CylinderGeometry(2.6, 2.4, 1.1, 32);
    this.meltSurface = new THREE.Mesh(bathGeo, this.materials.meltSurface);
    this.meltSurface.position.y = 0.4;
    group.add(this.meltSurface);

    [-0.9, 0, 0.9].forEach(x => {
      const elGeo = new THREE.CylinderGeometry(0.24, 0.22, 4.5, 20);
      const elMesh = new THREE.Mesh(elGeo, this.materials.graphite);
      elMesh.position.set(x, 3.5, 0);
      group.add(elMesh);
    });

    const grid = new THREE.GridHelper(28, 28, 0x1e2530, 0x13171f);
    grid.position.y = -1.2;
    scene.add(grid);
    scene.add(group);
  }

  _init3DSensorPins(container) {
    this.sensorPinsData = [
      {
        id: 'roof',
        title: 'Свод печи / Газоход',
        pos: new THREE.Vector3(0.0, 3.45, 0.0),
        format: state => `${Math.round(state.temp * 0.46)} °C · ${state.pressure} Па`
      },
      {
        id: 'electrodes',
        title: 'Электроды (3 фазы)',
        pos: new THREE.Vector3(0.0, 5.15, -1.7),
        format: state => `${state.current} кА · ${state.powerMw} МВт`
      },
      {
        id: 'bath',
        title: 'Ванна жидкой стали',
        pos: new THREE.Vector3(0.0, 0.25, 1.85),
        format: state => `${state.temp} °C · O₂ ${state.oxygen} м³/ч`
      },
      {
        id: 'water',
        title: 'Водоохлаждение панелей',
        pos: new THREE.Vector3(3.15, 1.35, 0.75),
        format: state => `${state.waterFlow} м³/ч · ΔT 8.4 °C`
      }
    ];

    this.sensorOverlay = document.createElement('div');
    this.sensorOverlay.className = 'sensor-3d-overlay';
    container.appendChild(this.sensorOverlay);

    this.sensorPinEls = this.sensorPinsData.map(pin => {
      const el = document.createElement('div');
      el.className = 'sensor-3d-pin';
      el.innerHTML = `
        <span class="pin-dot"></span>
        <div class="pin-box">
          <span class="pin-title">${pin.title}</span>
          <span class="pin-val" id="pin-val-${pin.id}">—</span>
        </div>
      `;
      this.sensorOverlay.appendChild(el);
      return {
        pin,
        el,
        valEl: el.querySelector(`#pin-val-${pin.id}`)
      };
    });
  }

  update3DFurnace(viewModel3D) {
    const {
      furnaceName,
      steelGrade,
      responsibleHud,
      temperature,
      current,
      pressure,
      oxygen,
      powerMw,
      waterFlow,
      isOverheated,
      isEmergency,
      alertBannerTag,
      alertBannerValue
    } = viewModel3D;

    const isAlarmVisual = Boolean(isOverheated || isEmergency);

    this.threeState.currentTemp = temperature;
    this.threeState.currentPowerMw = powerMw;
    this.threeState.currentSensorSnapshot = {
      temp: temperature,
      current,
      pressure,
      oxygen,
      powerMw,
      waterFlow
    };
    this.threeState.isOverheated = isAlarmVisual;

    if (this.dom.hudFurnaceTitle) {
      this.dom.hudFurnaceTitle.textContent = `${furnaceName} · ${steelGrade}`;
    }
    if (this.dom.hudResponsibleName) {
      this.dom.hudResponsibleName.textContent = responsibleHud;
    }
    if (this.dom.hudArcPower) {
      this.dom.hudArcPower.textContent = `${powerMw} МВт`;
    }
    if (this.dom.hudWaterFlow) {
      this.dom.hudWaterFlow.textContent = `${waterFlow} м³/ч`;
    }

    if (this.dom.viewport3D) {
      this.dom.viewport3D.classList.toggle('is-overheated', isAlarmVisual);
    }
    if (this.dom.overheatAlertBanner) {
      this.dom.overheatAlertBanner.classList.toggle('visible', isAlarmVisual);
    }
    if (this.dom.overheatAlertTag && alertBannerTag) {
      this.dom.overheatAlertTag.textContent = alertBannerTag;
    }
    if (this.dom.overheatTempText) {
      this.dom.overheatTempText.textContent = alertBannerValue || `${temperature} °C`;
    }

    const normT = Math.max(0, Math.min(1, (temperature - 1500) / 220));
    const normalColor = new THREE.Color(0xff8800);
    const criticalColor = new THREE.Color(0xff2200);
    const bathColor = new THREE.Color().lerpColors(normalColor, criticalColor, normT);

    if (this.materials && this.materials.meltSurface) {
      this.materials.meltSurface.color.copy(bathColor);
      this.materials.meltSurface.emissive.copy(bathColor);
      this.materials.meltSurface.emissiveIntensity = isOverheated ? 2.85 : (1.15 + normT * 0.9);
    }

    if (this.materials && this.materials.meltSection) {
      this.materials.meltSection.color.copy(bathColor);
      this.materials.meltSection.emissive.copy(bathColor);
      this.materials.meltSection.emissiveIntensity = isOverheated ? 2.4 : (1.0 + normT * 0.8);
    }

    if (this.threeState.bathGlowLight) {
      this.threeState.bathGlowLight.color.copy(bathColor);
      this.threeState.bathGlowLight.intensity = isOverheated ? 8.5 : (3.4 + normT * 2.2);
    }
  }

  setCameraPreset(presetName) {
    const presets = {
      overview: {
        pos: new THREE.Vector3(10.2, 6.2, 11.4),
        target: new THREE.Vector3(0.0, 1.25, 0.0)
      },
      roof: {
        pos: new THREE.Vector3(4.6, 8.8, 5.4),
        target: new THREE.Vector3(0.0, 3.1, -0.4)
      },
      bath: {
        pos: new THREE.Vector3(5.4, 2.5, 6.2),
        target: new THREE.Vector3(0.0, 0.55, 0.0)
      },
      reset: {
        pos: new THREE.Vector3(10.2, 6.2, 11.4),
        target: new THREE.Vector3(0.0, 1.25, 0.0)
      }
    };

    const chosen = presets[presetName] || presets.overview;
    this.threeState.cameraTargetLerp = chosen.pos.clone();
    this.threeState.lookAtTargetLerp = chosen.target.clone();
  }

  set3DRenderMode(mode) {
    this.threeState.renderMode = mode;
    const isCutaway = mode === 'cutaway';
    const isThermal = mode === 'thermal';

    if (this.shellFull) this.shellFull.visible = !isCutaway;
    if (this.shellCut) this.shellCut.visible = isCutaway;

    if (!this.materials) return;

    if (isThermal) {
      this.materials.heavySteel.color.setHex(0x1f306e);
      this.materials.heavySteel.emissive.setHex(0x0b1338);
      this.materials.coolingPanel.color.setHex(0xd9381e);
      this.materials.coolingPanel.emissive.setHex(0x6e1405);
      this.materials.coolingPanel.emissiveIntensity = 0.65;
    } else if (!this.threeState.isOverheated) {
      this.materials.heavySteel.color.setHex(0x5c6066);
      this.materials.heavySteel.emissive.setHex(0x000000);
      this.materials.coolingPanel.color.setHex(0x666c73);
      this.materials.coolingPanel.emissive.setHex(0x000000);
      this.materials.coolingPanel.emissiveIntensity = 0.0;
    }
  }

  _animate3D() {
    requestAnimationFrame(this._animate3D);

    const { scene, camera, renderer, controls } = this.threeState;
    if (!scene || !camera || !renderer) return;

    const time = (performance.now() - this.threeState.startTime) / 1000;

    if (this.threeState.cameraTargetLerp && this.threeState.lookAtTargetLerp) {
      camera.position.lerp(this.threeState.cameraTargetLerp, 0.09);
      controls.target.lerp(this.threeState.lookAtTargetLerp, 0.09);

      if (camera.position.distanceTo(this.threeState.cameraTargetLerp) < 0.05) {
        this.threeState.cameraTargetLerp = null;
        this.threeState.lookAtTargetLerp = null;
      }
    }

    controls.update();

    if (this.materials) {
      if (this.threeState.isOverheated) {
        const pulse = 0.55 + Math.sin(time * 7.5) * 0.35;
        this.materials.coolingPanel.emissive.setHex(0xff2a00);
        this.materials.coolingPanel.emissiveIntensity = pulse * 1.35;
        this.materials.heavySteel.emissive.setHex(0xcc1900);
        this.materials.heavySteel.emissiveIntensity = pulse * 0.85;
        this.materials.refractoryBrick.emissive.setHex(0xff3b00);
        this.materials.refractoryBrick.emissiveIntensity = pulse * 0.95;

        if (this.threeState.overheatSpotLight) {
          this.threeState.overheatSpotLight.intensity = 4.5 + Math.sin(time * 8.0) * 2.5;
        }
      } else if (this.threeState.renderMode !== 'thermal') {
        this.materials.coolingPanel.emissive.setHex(0x000000);
        this.materials.coolingPanel.emissiveIntensity = 0;
        this.materials.heavySteel.emissive.setHex(0x000000);
        this.materials.heavySteel.emissiveIntensity = 0;
        this.materials.refractoryBrick.emissive.setHex(0x000000);
        this.materials.refractoryBrick.emissiveIntensity = 0;

        if (this.threeState.overheatSpotLight) {
          this.threeState.overheatSpotLight.intensity = 0;
        }
      }
    }

    const pNorm = Math.min(1.0, (this.threeState.currentPowerMw || 42) / 50);

    this.threeState.arcGlows.forEach((core, idx) => {
      const flicker = 0.82 + Math.sin(time * 42 + idx * 2.1) * 0.22 + (Math.random() - 0.5) * 0.25;
      const scaleXZ = (0.85 + pNorm * 0.55) * flicker;
      core.scale.set(scaleXZ, 0.92 + Math.random() * 0.3, scaleXZ);
    });

    this.threeState.arcHalos.forEach((halo, idx) => {
      const pulse = 0.9 + Math.cos(time * 34 + idx * 2.0) * 0.2;
      halo.scale.setScalar((0.9 + pNorm * 0.55) * pulse);
    });

    this.threeState.arcLights.forEach((light, idx) => {
      const flicker = Math.sin(time * 48 + idx * 2.09) * 1.6 + (Math.random() - 0.5) * 2.0;
      light.intensity = Math.max(1.8, 4.5 + pNorm * 6.0 + flicker);
      light.color.setHex(
        this.threeState.isOverheated
          ? 0xff7b47
          : (Math.random() > 0.28 ? 0x9be2ff : 0xffe082)
      );
    });

    if (this.meltSurface) {
      this.meltSurface.rotation.y = time * 0.08;
      const bathPulse = 1.0 + Math.sin(time * 4.5) * 0.006;
      this.meltSurface.scale.set(bathPulse, 1, bathPulse);
    }

    this._update3DSensorPinPositions();
    renderer.render(scene, camera);
  }

  _update3DSensorPinPositions() {
    if (!this.threeState.showPins || !this.sensorPinEls || !this.threeState.camera) return;

    const container = this.dom.canvasContainer;
    if (!container) return;
    const width = container.clientWidth;
    const height = container.clientHeight;
    if (!width || !height) return;

    const snapshot = this.threeState.currentSensorSnapshot || {
      temp: 1588,
      current: 51.4,
      pressure: 44,
      oxygen: 2450,
      powerMw: 42.5,
      waterFlow: 76.4
    };

    const tempVec = new THREE.Vector3();
    this.sensorPinEls.forEach(item => {
      tempVec.copy(item.pin.pos);
      tempVec.project(this.threeState.camera);

      if (tempVec.z > 1.0) {
        item.el.style.opacity = '0';
        return;
      }

      item.el.style.opacity = '1';
      const x = (tempVec.x * 0.5 + 0.5) * width;
      const y = (-(tempVec.y * 0.5) + 0.5) * height;
      item.el.style.left = `${x}px`;
      item.el.style.top = `${y}px`;

      if (item.valEl) {
        item.valEl.textContent = item.pin.format(snapshot);
      }
    });
  }

  _onResize3D() {
    const container = this.dom.canvasContainer;
    const { camera, renderer } = this.threeState;
    if (!container || !camera || !renderer) return;

    const width = container.clientWidth || 720;
    const height = container.clientHeight || 500;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height);
  }
}
