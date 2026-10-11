// Промышленная инженерная 3D-модель дуговой сталеплавильной печи ДСП-135 (ЭСПЦ БМЗ, проект Danieli / SMS)
// Высокодетализированная CAD/SCADA визуализация на базе Three.js

import * as THREE from '../node_modules/three/build/three.module.js';

export class Furnace3D {
  constructor(containerId) {
    this.container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    if (!this.container) return;

    this.mode = 'cutaway'; // 'cutaway' | 'shell' | 'thermal' | 'wireframe'
    this.autoRotate = false;
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

    this.initScene();
    this.initProceduralTextures();
    this.initMaterials();
    this.buildShopEnvironment();
    this.buildFurnaceAssembly();
    this.setupEvents();

    this.lastTime = performance.now();
    this.startTime = performance.now();
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
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

    // Спокойное нейтральное инженерное освещение без кислотных оттенков
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

    // Внутренняя подсветка свода и ванны от расплава
    this.bathGlowLight = new THREE.PointLight(0xff5500, 4.2, 13, 1.4);
    this.bathGlowLight.position.set(0, 0.8, 0);
    this.scene.add(this.bathGlowLight);
  }

  // ============================================================================
  // 2. ПРОЦЕДУРНЫЕ ИНЖЕНЕРНЫЕ ТЕКСТУРЫ (БЕЗ ВНЕШНИХ ФАЙЛОВ)
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

    // 2. Текстура водоохлаждаемых трубчатых панелей (горизонтальные змеевики)
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

    // Флокулы шлака на поверхности
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

    // 4. Текстура стального рифленого настила (Чечевица)
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

  // ============================================================================
  // 3. БИБЛИОТЕКА МАТЕРИАЛОВ
  // ============================================================================
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
        color: 0x56768a, // Магистрали охлаждающей воды (приглушенный серо-синий)
        roughness: 0.38,
        metalness: 0.55
      }),
      copperBus: new THREE.MeshStandardMaterial({
        color: 0xc87846, // Медные токоведущие шины и зажимы
        roughness: 0.3,
        metalness: 0.75
      }),
      chromeRod: new THREE.MeshStandardMaterial({
        color: 0xdcdcdc, // Штоки гидроцилиндров и направляющие
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
        color: 0x82553a, // Набивная подина и дельта свода
        roughness: 0.9,
        metalness: 0.05
      }),
      rammingMass: new THREE.MeshStandardMaterial({
        color: 0x633f2b,
        roughness: 0.92,
        metalness: 0.04
      }),
      graphite: new THREE.MeshStandardMaterial({
        color: 0x282a2d, // Графитированный электрод
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
        color: 0x946b22, // Приглушенный индустриальный охристо-желтый для перил
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
      })
    };
  }

  // Вспомогательный метод добавления инженерного CAD-контура детали
  addCadEdges(mesh, threshold = 28) {
    if (!mesh || !mesh.geometry) return mesh;
    const edgesGeo = new THREE.EdgesGeometry(mesh.geometry, threshold);
    const line = new THREE.LineSegments(edgesGeo, this.materials.edgeLine);
    mesh.add(line);
    return mesh;
  }

  // ============================================================================
  // 4. ЦЕХОВОЕ ОКРУЖЕНИЕ, ФУНДАМЕНТ, СТЕНЫ ТРАНСФОРМАТОРНОЙ И КОВШ
  // ============================================================================
  buildShopEnvironment() {
    this.envGroup = new THREE.Group();
    this.scene.add(this.envGroup);

    // Координатная сетка цеха на отметке -4.3м
    const grid = new THREE.GridHelper(32, 32, 0x32353b, 0x202226);
    grid.position.y = -4.29;
    this.envGroup.add(grid);

    // Пол цеха
    const floorGeo = new THREE.PlaneGeometry(45, 45);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMesh = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({
      color: 0x141618,
      roughness: 0.95,
      metalness: 0.08
    }));
    floorMesh.position.y = -4.3;
    floorMesh.receiveShadow = true;
    this.envGroup.add(floorMesh);

    // 1. Два массивных железобетонных быка (пилона) фундамента под люльку печи
    const pierGeo = new THREE.BoxGeometry(1.4, 2.0, 7.6);
    [-2.75, 2.75].forEach(xPos => {
      const pier = new THREE.Mesh(pierGeo, this.materials.concrete);
      pier.position.set(xPos, -3.3, 0);
      pier.receiveShadow = true;
      pier.castShadow = true;
      this.addCadEdges(pier);
      this.envGroup.add(pier);

      // Стальная опорная плита с зубчатой рейкой по верху быка
      const trackPlate = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.18, 6.8), this.materials.darkSteel);
      trackPlate.position.set(xPos, -2.21, 0);
      this.addCadEdges(trackPlate);
      this.envGroup.add(trackPlate);

      // Зубья рейки качения
      for (let z = -2.6; z <= 2.6; z += 0.35) {
        const tooth = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.08, 0.14), this.materials.heavySteel);
        tooth.position.set(xPos, -2.09, z);
        this.envGroup.add(tooth);
      }
    });

    // 2. Рабочая площадка сталевара вокруг печи (Отметка -1.2м)
    const deckGroup = new THREE.Group();
    // Задняя и боковые части рабочей площадки
    const backDeck = new THREE.Mesh(new THREE.BoxGeometry(13.5, 0.18, 4.2), this.materials.platformGrate);
    backDeck.position.set(0, -1.3, -4.9);
    backDeck.receiveShadow = true;
    this.addCadEdges(backDeck);
    deckGroup.add(backDeck);

    // Боковая площадка со стороны рабочего окна (шлаковая сторона, +X)
    const rightDeck = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.18, 8.2), this.materials.platformGrate);
    rightDeck.position.set(5.4, -1.3, 0.8);
    rightDeck.receiveShadow = true;
    this.addCadEdges(rightDeck);
    deckGroup.add(rightDeck);

    // Опорные колонны рабочей площадки
    const colGeo = new THREE.BoxGeometry(0.32, 3.0, 0.32);
    const colPositions = [
      [-6.2, -2.8, -6.5], [-6.2, -2.8, -3.2],
      [6.2, -2.8, -6.5], [6.2, -2.8, -3.2],
      [6.8, -2.8, 1.2], [6.8, -2.8, 4.4],
      [3.9, -2.8, 4.4]
    ];
    colPositions.forEach(([cx, cy, cz]) => {
      const col = new THREE.Mesh(colGeo, this.materials.structuralBeam);
      col.position.set(cx, cy, cz);
      col.castShadow = true;
      this.addCadEdges(col);
      deckGroup.add(col);
    });

    // Ограждения безопасности на площадке
    this.buildRailing(deckGroup, [
      [-6.6, -1.2, -6.9], [6.6, -1.2, -6.9], [6.6, -1.2, 4.8], [3.7, -1.2, 4.8]
    ]);

    this.envGroup.add(deckGroup);

    // 3. Здание печного трансформатора (120 МВА) с выводами короткой сети
    const transHouse = new THREE.Group();
    transHouse.position.set(0, 1.1, -6.4);

    const vaultBox = new THREE.Mesh(new THREE.BoxGeometry(5.6, 4.6, 2.6), this.materials.darkSteel);
    vaultBox.castShadow = true;
    vaultBox.receiveShadow = true;
    this.addCadEdges(vaultBox);
    transHouse.add(vaultBox);

    // Радиаторы охлаждения трансформатора по бокам
    [-2.95, 2.95].forEach(rx => {
      const rad = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.2, 1.8), this.materials.heavySteel);
      rad.position.set(rx, 0, 0);
      this.addCadEdges(rad);
      transHouse.add(rad);
    });

    // Проходные изоляторы и медные выводы короткой сети (Дельта-замыкание)
    const phaseX = [-1.15, 0, 1.15];
    this.transTerminals = [];
    phaseX.forEach(px => {
      const bushing = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.65, 16), this.materials.heavySteel);
      bushing.rotation.x = Math.PI / 2;
      bushing.position.set(px, 1.35, 1.35);
      transHouse.add(bushing);

      const copperShoe = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.45), this.materials.copperBus);
      copperShoe.position.set(px, 1.35, 1.65);
      transHouse.add(copperShoe);

      // Сохраняем мировые координаты выводов для привязки гибких кабелей
      this.transTerminals.push(new THREE.Vector3(px, 2.45, -4.75));
    });

    this.envGroup.add(transHouse);

    // 4. Сталеразливочный ковш (135 т) в приямке под эркером EBT (слева, -X)
    this.buildSteelLadle();

    // 5. Шлаковая чаша под рабочим окном (справа, +X)
    this.buildSlagPot();
  }

  buildRailing(parent, points) {
    const postGeo = new THREE.CylinderGeometry(0.03, 0.03, 0.9, 8);
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = new THREE.Vector3(...points[i]);
      const p2 = new THREE.Vector3(...points[i + 1]);
      const dist = p1.distanceTo(p2);
      const steps = Math.max(2, Math.floor(dist / 1.4));

      for (let s = 0; s <= steps; s++) {
        const p = new THREE.Vector3().lerpVectors(p1, p2, s / steps);
        const post = new THREE.Mesh(postGeo, this.materials.safetyRail);
        post.position.set(p.x, p.y + 0.45, p.z);
        parent.add(post);
      }

      // Поручень верхний и средний
      [0.88, 0.48].forEach(h => {
        const railGeo = new THREE.CylinderGeometry(0.025, 0.025, dist, 8);
        railGeo.rotateZ(Math.PI / 2);
        const rail = new THREE.Mesh(railGeo, this.materials.safetyRail);
        const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
        rail.position.set(mid.x, mid.y + h, mid.z);
        const angle = Math.atan2(p2.z - p1.z, p2.x - p1.x);
        rail.rotation.y = -angle;
        parent.add(rail);
      });
    }
  }

  buildSteelLadle() {
    const ladleGroup = new THREE.Group();
    ladleGroup.position.set(-4.55, -3.15, 0);

    // Корпус сталеразливочного ковша
    const ladleShell = new THREE.Mesh(new THREE.CylinderGeometry(1.38, 1.18, 2.2, 28), this.materials.heavySteel);
    ladleShell.castShadow = true;
    ladleShell.receiveShadow = true;
    this.addCadEdges(ladleShell);
    ladleGroup.add(ladleShell);

    // Пояса жесткости ковша и цапфы
    [-0.5, 0.55].forEach(y => {
      const band = new THREE.Mesh(new THREE.TorusGeometry(1.34, 0.07, 10, 28), this.materials.darkSteel);
      band.rotation.x = Math.PI / 2;
      band.position.y = y;
      ladleGroup.add(band);
    });

    // Цапфы для крана
    const trunnion = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 3.2, 16), this.materials.chromeRod);
    trunnion.rotation.x = Math.PI / 2;
    trunnion.position.y = 0.55;
    ladleGroup.add(trunnion);

    // Светящееся зеркало металла внутри ковша
    const ladleMelt = new THREE.Mesh(new THREE.CircleGeometry(1.25, 24), this.materials.meltSurface);
    ladleMelt.rotation.x = -Math.PI / 2;
    ladleMelt.position.y = 0.85;
    ladleGroup.add(ladleMelt);

    // Рельсы сталевоза
    [-1.1, 1.1].forEach(z => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(4.5, 0.1, 0.12), this.materials.chromeRod);
      rail.position.set(0, -1.1, z);
      ladleGroup.add(rail);
    });

    this.envGroup.add(ladleGroup);
  }

  buildSlagPot() {
    const potGroup = new THREE.Group();
    potGroup.position.set(4.5, -3.4, 0);

    const potMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.15, 0.72, 1.6, 20), this.materials.darkSteel);
    potMesh.castShadow = true;
    this.addCadEdges(potMesh);
    potGroup.add(potMesh);

    this.envGroup.add(potGroup);
  }

  // ============================================================================
  // 5. СБОРКА ДУГОВОЙ ПЕЧИ ДСП-135 (НАКЛОНЯЕМАЯ ПЛАТФОРМА)
  // ============================================================================
  buildFurnaceAssembly() {
    // Главный узел наклона (вращается вокруг оси Z при выпуске и скачивании шлака)
    this.tiltPivot = new THREE.Group();
    this.tiltPivot.position.set(0, -1.65, 0);
    this.scene.add(this.tiltPivot);

    // Смещение внутри люльки так, чтобы координаты кожуха оставались удобными
    this.furnaceRoot = new THREE.Group();
    this.furnaceRoot.position.set(0, 1.65, 0);
    this.tiltPivot.add(this.furnaceRoot);

    this.buildRockerCradle();
    this.buildVesselAndRefractory();
    this.buildMeltAndScrap();
    this.buildRoofAndDelta();
    this.buildGantryMastsAndArms();
    this.buildFlexibleCables();
    this.buildTappingStream();

    this.applyMode();
    this.update(this.params);
  }

  // 5.1 Люлька качения и гидропривод наклона (Rocker Cradle)
  buildRockerCradle() {
    this.cradleGroup = new THREE.Group();
    this.furnaceRoot.add(this.cradleGroup);

    // Профиль дугового сегмента люльки (ExtrudeGeometry)
    const rockerShape = new THREE.Shape();
    rockerShape.moveTo(-2.6, 0.45);
    rockerShape.lineTo(2.6, 0.45);
    rockerShape.lineTo(2.4, -0.15);
    rockerShape.quadraticCurveTo(0, -0.75, -2.4, -0.15);
    rockerShape.closePath();

    const extrudeSettings = {
      steps: 1,
      depth: 0.48,
      bevelEnabled: true,
      bevelThickness: 0.04,
      bevelSize: 0.04,
      bevelSegments: 2
    };

    const rockerGeo = new THREE.ExtrudeGeometry(rockerShape, extrudeSettings);
    rockerGeo.rotateY(Math.PI / 2);

    [-2.95, 2.47].forEach(xPos => {
      const rocker = new THREE.Mesh(rockerGeo, this.materials.structuralBeam);
      rocker.position.set(xPos, -1.75, 0);
      rocker.castShadow = true;
      rocker.receiveShadow = true;
      this.addCadEdges(rocker);
      this.cradleGroup.add(rocker);
    });

    // Поперечные силовые балки рамы люльки под днищем печи
    const crossBeamGeo = new THREE.BoxGeometry(6.4, 0.52, 0.65);
    [-2.05, 0, 2.05].forEach(zPos => {
      const beam = new THREE.Mesh(crossBeamGeo, this.materials.heavySteel);
      beam.position.set(0, -1.52, zPos);
      beam.castShadow = true;
      this.addCadEdges(beam);
      this.cradleGroup.add(beam);
    });

    // Продольные поддомкратные балки кожуха
    const sideBeamGeo = new THREE.BoxGeometry(0.55, 0.55, 5.4);
    [-3.1, 3.1].forEach(xPos => {
      const sBeam = new THREE.Mesh(sideBeamGeo, this.materials.heavySteel);
      sBeam.position.set(xPos, -1.1, 0);
      this.addCadEdges(sBeam);
      this.cradleGroup.add(sBeam);
    });

    // Гидроцилиндры наклона печи (стационарно закреплены в приямке)
    [-2.75, 2.75].forEach(xPos => {
      const cylGroup = new THREE.Group();
      cylGroup.position.set(xPos, -3.5, 2.25);

      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.25, 1.9, 16), this.materials.darkSteel);
      barrel.position.y = 0.7;
      this.addCadEdges(barrel);
      cylGroup.add(barrel);

      const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 1.8, 16), this.materials.chromeRod);
      piston.position.y = 1.6;
      cylGroup.add(piston);

      this.envGroup.add(cylGroup);
    });
  }

  // 5.2 Кожух печи, водоохлаждаемые панели, эркер EBT и многослойная футеровка
  buildVesselAndRefractory() {
    this.shellFull = new THREE.Group();
    this.shellCut = new THREE.Group();
    this.furnaceRoot.add(this.shellFull);
    this.furnaceRoot.add(this.shellCut);

    const R = 3.25;         // Радиус стального кожуха
    const R_brick = 2.92;   // Внутренний радиус огнеупорной кладки
    const H_wall = 2.25;    // Высота цилиндрической части (стеновых панелей)

    // Углы для режима разреза (вырез 115 градусов спереди-справа к оператору)
    const startAngle = Math.PI * 0.58;
    const cutArc = Math.PI * 1.36;

    // Вспомогательный сборщик деталей корпуса для обоих режимов (Full / Cutaway)
    const populateVessel = (group, isCut) => {
      const phiStart = isCut ? startAngle : 0;
      const phiLen = isCut ? cutArc : Math.PI * 2;

      // 1. Сферическое стальное днище (подина)
      const bottomGeo = new THREE.SphereGeometry(R, 40, 18, phiStart, phiLen, Math.PI * 0.5, Math.PI * 0.36);
      const bottomMesh = new THREE.Mesh(bottomGeo, this.materials.heavySteel);
      bottomMesh.position.y = -0.35;
      bottomMesh.castShadow = true;
      bottomMesh.receiveShadow = true;
      group.add(bottomMesh);

      // 2. Нижний стальной пояс (шлаковый пояс / hearth cage)
      const lowerCageGeo = new THREE.CylinderGeometry(R, R, 0.75, 40, 1, true, phiStart, phiLen);
      const lowerCage = new THREE.Mesh(lowerCageGeo, this.materials.heavySteel);
      lowerCage.position.y = 0.02;
      lowerCage.castShadow = true;
      group.add(lowerCage);

      // 3. Верхний пояс из водоохлаждаемых трубчатых панелей (Water-cooled panels)
      const panelWallGeo = new THREE.CylinderGeometry(R - 0.04, R - 0.04, 1.5, 40, 1, true, phiStart, phiLen);
      const panelWall = new THREE.Mesh(panelWallGeo, this.materials.coolingPanel);
      panelWall.position.y = 1.15;
      panelWall.castShadow = true;
      panelWall.receiveShadow = true;
      group.add(panelWall);

      // 4. Горизонтальные бандажные кольца жесткости и коллекторы охлаждения
      [-0.35, 0.4, 1.15, 1.9].forEach((yPos, idx) => {
        const ringRadius = idx === 3 ? R + 0.14 : R + 0.08;
        const tubeRad = idx === 3 ? 0.11 : 0.065;
        const ringGeo = new THREE.TorusGeometry(ringRadius, tubeRad, 12, 44, phiLen);
        ringGeo.rotateX(Math.PI / 2);
        ringGeo.rotateZ(phiStart);
        const mat = idx === 2 ? this.materials.copperWaterPipe : this.materials.darkSteel;
        const ring = new THREE.Mesh(ringGeo, mat);
        ring.position.y = yPos;
        ring.castShadow = true;
        group.add(ring);
      });

      // 5. Вертикальные стойки каркаса ("беличья клетка" кожуха печи)
      const numRibs = 16;
      const ribGeo = new THREE.BoxGeometry(0.14, 2.35, 0.22);
      for (let i = 0; i < numRibs; i++) {
        const ang = (i / numRibs) * Math.PI * 2;
        // Пропускаем место эркера EBT (-X) и рабочего окна (+X)
        if (Math.abs(Math.cos(ang)) > 0.92) continue;

        // Проверяем, попадает ли стойка в сектор разреза
        const normAng = ((ang - phiStart) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        if (isCut && normAng > phiLen) continue;

        const rib = new THREE.Mesh(ribGeo, this.materials.darkSteel);
        rib.position.set(Math.cos(ang) * (R + 0.06), 0.72, Math.sin(ang) * (R + 0.06));
        rib.rotation.y = -ang + Math.PI / 2;
        rib.castShadow = true;
        this.addCadEdges(rib);
        group.add(rib);
      }

      // 6. Эркерный узел донного выпуска стали (EBT — Eccentric Bottom Tapping) слева (-X)
      const ebtGroup = new THREE.Group();
      ebtGroup.position.set(-3.15, 0.55, 0);

      const ebtBox = new THREE.Mesh(new THREE.BoxGeometry(1.55, 1.85, 1.75), this.materials.heavySteel);
      ebtBox.castShadow = true;
      this.addCadEdges(ebtBox);
      ebtGroup.add(ebtBox);

      // Донный шиберный затвор выпуска стали
      const tapNozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.65, 16), this.materials.darkSteel);
      tapNozzle.position.set(-0.35, -1.15, 0);
      ebtGroup.add(tapNozzle);

      // Крышка обслуживания EBT сверху эркера
      const ebtCover = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.6, 0.25, 20), this.materials.coolingPanel);
      ebtCover.position.set(-0.25, 1.02, 0);
      this.addCadEdges(ebtCover);
      ebtGroup.add(ebtCover);

      group.add(ebtGroup);

      // 7. Рабочее окно (шлаковая дверь и фурменный блок инжекции O2/C) справа (+X)
      const doorGroup = new THREE.Group();
      doorGroup.position.set(3.25, 0.65, 0);

      const tunnelFrame = new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.35, 1.45), this.materials.darkSteel);
      this.addCadEdges(tunnelFrame);
      doorGroup.add(tunnelFrame);

      // Водоохлаждаемая заслонка рабочего окна
      const doorSlab = new THREE.Mesh(new THREE.BoxGeometry(0.2, 1.1, 1.15), this.materials.coolingPanel);
      doorSlab.position.set(0.45, 0.05, 0);
      this.addCadEdges(doorSlab);
      doorGroup.add(doorSlab);

      // Стеновая газокислородная горелка-ланса (CoJet) с медными и водяными подводами
      const burnerBody = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.18, 0.95, 12), this.materials.copperBus);
      burnerBody.rotation.z = Math.PI / 3;
      burnerBody.position.set(0.25, 0.55, 0.55);
      doorGroup.add(burnerBody);

      group.add(doorGroup);

      // 8. Огнеупорная футеровка и торцевые срезы (только для режима РАЗРЕЗ)
      if (isCut) {
        // Внутренняя кирпичная стенка
        const innerBrickGeo = new THREE.CylinderGeometry(R_brick, R_brick - 0.15, H_wall - 0.1, 40, 1, true, phiStart, phiLen);
        // Инвертируем нормали чтобы видеть внутреннюю поверхность
        innerBrickGeo.scale(-1, 1, 1);
        const innerBrick = new THREE.Mesh(innerBrickGeo, this.materials.refractoryBrick);
        innerBrick.position.y = 0.72;
        innerBrick.rotation.y = - (phiStart * 2 + phiLen);
        group.add(innerBrick);

        // Набивная магнезитовая подина (блюдцеобразное дно)
        const hearthBowlGeo = new THREE.SphereGeometry(R_brick, 36, 16, phiStart, phiLen, Math.PI * 0.52, Math.PI * 0.34);
        hearthBowlGeo.scale(-1, 1, 1);
        const hearthBowl = new THREE.Mesh(hearthBowlGeo, this.materials.refractoryCastable);
        hearthBowl.position.y = -0.22;
        hearthBowl.rotation.y = - (phiStart * 2 + phiLen);
        group.add(hearthBowl);

        // Торцевые срезы стенки и подины на границах выреза
        [phiStart, phiStart + cutArc].forEach(edgeAng => {
          const wallSliceGroup = new THREE.Group();
          wallSliceGroup.rotation.y = -edgeAng;

          // Срез огнеупорного кирпича стенки
          const brickThickness = R - R_brick;
          const sliceBrick = new THREE.Mesh(
            new THREE.BoxGeometry(brickThickness, H_wall - 0.1, 0.08),
            this.materials.refractoryBrick
          );
          sliceBrick.position.set(R_brick + brickThickness / 2, 0.72, 0);
          this.addCadEdges(sliceBrick);
          wallSliceGroup.add(sliceBrick);

          // Срез набивной подины снизу
          const hearthSlice = new THREE.Mesh(
            new THREE.BoxGeometry(R_brick + 0.25, 0.58, 0.08),
            this.materials.rammingMass
          );
          hearthSlice.position.set((R_brick + 0.25) / 2, -0.78, 0);
          this.addCadEdges(hearthSlice);
          wallSliceGroup.add(hearthSlice);

          group.add(wallSliceGroup);
        });
      }
    };

    populateVessel(this.shellFull, false);
    populateVessel(this.shellCut, true);
  }

  // 5.3 Ванна жидкого металла, вспененный шлак и куча металлолома (для стадии Завалка)
  buildMeltAndScrap() {
    this.bathGroup = new THREE.Group();
    this.furnaceRoot.add(this.bathGroup);

    const R_melt = 2.84;

    // 1. Объем жидкой стали в подине
    const meltBodyGeo = new THREE.CylinderGeometry(R_melt, 2.35, 0.78, 40);
    this.meltBody = new THREE.Mesh(meltBodyGeo, this.materials.meltSection);
    this.meltBody.position.y = -0.15;
    this.bathGroup.add(this.meltBody);

    // 2. Светящееся зеркало расплава
    const surfaceGeo = new THREE.CircleGeometry(R_melt, 44);
    surfaceGeo.rotateX(-Math.PI / 2);
    this.meltSurface = new THREE.Mesh(surfaceGeo, this.materials.meltSurface);
    this.meltSurface.position.y = 0.25;
    this.bathGroup.add(this.meltSurface);

    // 3. Пояс вспененного шлака по периметру ванны
    const slagRingGeo = new THREE.RingGeometry(1.85, R_melt + 0.02, 40);
    slagRingGeo.rotateX(-Math.PI / 2);
    this.slagRing = new THREE.Mesh(slagRingGeo, this.materials.slagLayer);
    this.slagRing.position.y = 0.265;
    this.bathGroup.add(this.slagRing);

    // 4. Крупногабаритный стальной лом (шихта) — виден при Завалке и начале Плавления
    this.scrapGroup = new THREE.Group();
    this.scrapGroup.position.y = 0.2;
    const scrapGeos = [
      new THREE.BoxGeometry(0.75, 0.25, 0.45),
      new THREE.CylinderGeometry(0.22, 0.22, 0.9, 10),
      new THREE.BoxGeometry(1.1, 0.18, 0.28),
      new THREE.OctahedronGeometry(0.38, 0)
    ];

    for (let i = 0; i < 28; i++) {
      const geo = scrapGeos[i % scrapGeos.length];
      const mesh = new THREE.Mesh(geo, this.materials.darkSteel);
      const ang = (i / 28) * Math.PI * 2 + (i % 3) * 0.4;
      const rad = 0.35 + (i % 5) * 0.42;
      mesh.position.set(
        Math.cos(ang) * rad,
        0.15 + (i % 4) * 0.22,
        Math.sin(ang) * rad
      );
      mesh.rotation.set(i * 0.7, i * 1.1, i * 0.5);
      mesh.castShadow = true;
      this.addCadEdges(mesh);
      this.scrapGroup.add(mesh);
    }
    this.bathGroup.add(this.scrapGroup);
  }

  // 5.4 Водоохлаждаемый свод печи, огнеупорная дельта и газоотвод (4-е отверстие)
  buildRoofAndDelta() {
    // Узел поворота свода вокруг колонны портала
    this.roofSwingPivot = new THREE.Group();
    this.roofSwingPivot.position.set(-2.35, 1.92, -3.55);
    this.furnaceRoot.add(this.roofSwingPivot);

    this.roofGroup = new THREE.Group();
    this.roofGroup.position.set(2.35, 0, 3.55);
    this.roofSwingPivot.add(this.roofGroup);

    const R_roof = 3.38;

    // 1. Внешнее опорное водоохлаждаемое кольцо свода
    const roofRingGeo = new THREE.TorusGeometry(R_roof, 0.14, 14, 48);
    roofRingGeo.rotateX(Math.PI / 2);
    const roofRing = new THREE.Mesh(roofRingGeo, this.materials.heavySteel);
    roofRing.castShadow = true;
    this.roofGroup.add(roofRing);

    // 2. Конический купол трубчатых водоохлаждаемых панелей свода
    const domeGeo = new THREE.CylinderGeometry(1.48, R_roof - 0.05, 0.72, 44, 1, true);
    const domeMesh = new THREE.Mesh(domeGeo, this.materials.coolingPanel);
    domeMesh.position.y = 0.38;
    domeMesh.castShadow = true;
    domeMesh.receiveShadow = true;
    this.roofGroup.add(domeMesh);

    // Радиальные ребра жесткости свода и коллекторы охлаждения
    for (let i = 0; i < 12; i++) {
      const ang = (i / 12) * Math.PI * 2;
      const rib = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 1.95), this.materials.darkSteel);
      rib.position.set(Math.cos(ang) * 2.4, 0.42, Math.sin(ang) * 2.4);
      rib.rotation.y = -ang + Math.PI / 2;
      rib.rotation.x = 0.34;
      this.addCadEdges(rib);
      this.roofGroup.add(rib);
    }

    // Кольцевой водяной коллектор свода (сине-бирюзовая магистраль)
    const waterHeaderGeo = new THREE.TorusGeometry(2.55, 0.065, 10, 40);
    waterHeaderGeo.rotateX(Math.PI / 2);
    const waterHeader = new THREE.Mesh(waterHeaderGeo, this.materials.copperWaterPipe);
    waterHeader.position.y = 0.55;
    this.roofGroup.add(waterHeader);

    // 3. Центральная огнеупорная вставка свода ("Дельта" с 3 портами под электроды)
    const deltaMesh = new THREE.Mesh(new THREE.CylinderGeometry(1.48, 1.48, 0.28, 32), this.materials.refractoryCastable);
    deltaMesh.position.y = 0.72;
    this.addCadEdges(deltaMesh);
    this.roofGroup.add(deltaMesh);

    // Окантовка портов электродов (уплотнительные кольца)
    const deltaRad = 0.86;
    [Math.PI / 2, Math.PI / 2 + (Math.PI * 2) / 3, Math.PI / 2 + (Math.PI * 4) / 3].forEach(ang => {
      const portRing = new THREE.Mesh(new THREE.TorusGeometry(0.32, 0.055, 10, 24), this.materials.heavySteel);
      portRing.rotation.x = Math.PI / 2;
      portRing.position.set(Math.cos(ang) * deltaRad, 0.87, Math.sin(ang) * deltaRad);
      this.roofGroup.add(portRing);
    });

    // 4. Патрубок 4-го отверстия свода и водоохлаждаемый газоотвод (Elbow Duct) к газоочистке
    const elbowGroup = new THREE.Group();
    elbowGroup.position.set(-1.75, 0.55, -1.35);

    const ductBase = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.64, 0.95, 24), this.materials.coolingPanel);
    ductBase.rotation.z = 0.28;
    ductBase.rotation.x = -0.25;
    ductBase.castShadow = true;
    this.addCadEdges(ductBase);
    elbowGroup.add(ductBase);

    const ductUpper = new THREE.Mesh(new THREE.CylinderGeometry(0.54, 0.58, 1.65, 24), this.materials.coolingPanel);
    ductUpper.position.set(-0.55, 0.95, -0.55);
    ductUpper.rotation.z = 0.75;
    ductUpper.rotation.x = -0.55;
    this.addCadEdges(ductUpper);
    elbowGroup.add(ductUpper);

    // Фланец газохода
    const ductFlange = new THREE.Mesh(new THREE.TorusGeometry(0.6, 0.07, 10, 24), this.materials.heavySteel);
    ductFlange.rotation.x = Math.PI / 2 + 0.28;
    ductFlange.position.set(-0.22, 0.45, -0.2);
    elbowGroup.add(ductFlange);

    this.roofGroup.add(elbowGroup);

    // 5. Четыре мощные цепи/тяги подвески свода к консольным балкам портала
    const hangerCoords = [
      [-1.95, 0.15, 1.85], [1.95, 0.15, 1.85],
      [-1.95, 0.15, -1.85], [1.95, 0.15, -1.85]
    ];
    hangerCoords.forEach(([hx, hy, hz]) => {
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.68, 10), this.materials.chromeRod);
      rod.position.set(hx, hy + 0.84, hz);
      this.roofGroup.add(rod);

      // Проушина крепления на кольце свода
      const lug = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.24), this.materials.heavySteel);
      lug.position.set(hx, hy + 0.08, hz);
      this.addCadEdges(lug);
      this.roofGroup.add(lug);
    });

    // Две продольные несущие балки портала над сводом
    [-1.95, 1.95].forEach(bx => {
      const roofBeam = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.48, 6.2), this.materials.structuralBeam);
      roofBeam.position.set(bx, 1.82, -0.85);
      roofBeam.castShadow = true;
      this.addCadEdges(roofBeam);
      this.roofGroup.add(roofBeam);
    });

    // Поперечная связующая траверса портала свода
    const crossGantry = new THREE.Mesh(new THREE.BoxGeometry(4.4, 0.54, 0.55), this.materials.structuralBeam);
    crossGantry.position.set(0, 1.82, -3.55);
    this.addCadEdges(crossGantry);
    this.roofGroup.add(crossGantry);
  }

  // 5.5 Портал, колонны мачт, токоведущие рукава и графитовые электроды
  buildGantryMastsAndArms() {
    this.gantryBase = new THREE.Group();
    this.furnaceRoot.add(this.gantryBase);

    // Массивный опорный портал позади печи
    const mastPlatform = new THREE.Mesh(new THREE.BoxGeometry(3.8, 2.2, 1.65), this.materials.structuralBeam);
    mastPlatform.position.set(0, -0.25, -3.85);
    mastPlatform.castShadow = true;
    this.addCadEdges(mastPlatform);
    this.gantryBase.add(mastPlatform);

    // Поворотная колонна (Kingpin) механизма отворота свода
    const pivotTower = new THREE.Mesh(new THREE.CylinderGeometry(0.48, 0.56, 3.8, 24), this.materials.heavySteel);
    pivotTower.position.set(-2.35, 1.8, -3.55);
    pivotTower.castShadow = true;
    this.addCadEdges(pivotTower);
    this.gantryBase.add(pivotTower);

    // 3 стационарные направляющие стойки мачт электрододержателей
    const mastX = [-1.15, 0, 1.15];
    mastX.forEach(mx => {
      const guideCol = new THREE.Mesh(new THREE.BoxGeometry(0.38, 6.6, 0.46), this.materials.darkSteel);
      guideCol.position.set(mx, 3.8, -3.85);
      guideCol.castShadow = true;
      this.addCadEdges(guideCol);
      this.gantryBase.add(guideCol);

      // Полированные направляющие рельсы каретки
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.14, 6.4, 0.08), this.materials.chromeRod);
      rail.position.set(mx, 3.8, -3.59);
      this.gantryBase.add(rail);
    });

    // Подвижная группа электродов и рукавов (перемещается вверх-вниз по мачтам)
    this.electrodeGroup = new THREE.Group();
    this.furnaceRoot.add(this.electrodeGroup);

    this.arcGlows = [];
    this.arcHalos = [];
    this.arcLights = [];
    this.cableArmAnchors = [];

    // Координаты 3 электродов в вершинах равностороннего треугольника (Дельта)
    const deltaRad = 0.86;
    // Сопоставляем левую мачту (-1.15), центральную (0) и правую (+1.15) с электродами
    const elConfigs = [
      { mastX: -1.15, ang: Math.PI / 2 + (Math.PI * 2) / 3 }, // Фаза A (левая)
      { mastX: 0.0,   ang: Math.PI / 2 },                     // Фаза B (передняя центральная)
      { mastX: 1.15,  ang: Math.PI / 2 + (Math.PI * 4) / 3 }  // Фаза C (правая)
    ];

    const elRadius = 0.23; // Электрод Ø460–500 мм в масштабе
    const elLength = 5.4;

    elConfigs.forEach(cfg => {
      const ex = Math.cos(cfg.ang) * deltaRad;
      const ez = Math.sin(cfg.ang) * deltaRad;

      const phaseAssembly = new THREE.Group();

      // 1. Каретка на мачте
      const carriage = new THREE.Mesh(new THREE.BoxGeometry(0.52, 1.15, 0.56), this.materials.heavySteel);
      carriage.position.set(cfg.mastX, 4.45, -3.85);
      this.addCadEdges(carriage);
      phaseAssembly.add(carriage);

      // 2. Горизонтальный водоохлаждаемый токоведущий рукав (Conductive Electrode Arm)
      const startPt = new THREE.Vector3(cfg.mastX, 4.55, -3.55);
      const endPt = new THREE.Vector3(ex, 4.55, ez);
      const armVec = new THREE.Vector3().subVectors(endPt, startPt);
      const armLen = armVec.length();

      const armBox = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, armLen - 0.35), this.materials.copperBus);
      const midPt = new THREE.Vector3().addVectors(startPt, endPt).multiplyScalar(0.5);
      armBox.position.copy(midPt);
      armBox.lookAt(endPt);
      armBox.castShadow = true;
      this.addCadEdges(armBox);
      phaseAssembly.add(armBox);

      // Стальной короб жесткости рукава
      const steelJacket = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.22, armLen * 0.62), this.materials.structuralBeam);
      const jacketPos = new THREE.Vector3().lerpVectors(startPt, endPt, 0.32);
      steelJacket.position.copy(jacketPos);
      steelJacket.lookAt(endPt);
      this.addCadEdges(steelJacket);
      phaseAssembly.add(steelJacket);

      // 3. Медный хомут и контактные щеки электрододержателя (Clamping Head)
      const clampRing = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.35, 0.46, 24), this.materials.copperBus);
      clampRing.position.set(ex, 4.55, ez);
      this.addCadEdges(clampRing);
      phaseAssembly.add(clampRing);

      // 4. Колонна графитового электрода (из 3 свинченных секций с ниппельными поясками)
      const elColumn = new THREE.Group();
      elColumn.position.set(ex, 2.75, ez);

      const mainShaft = new THREE.Mesh(new THREE.CylinderGeometry(elRadius, elRadius, elLength - 0.55, 28), this.materials.graphite);
      mainShaft.position.y = 0.275;
      mainShaft.castShadow = true;
      elColumn.add(mainShaft);

      // Стыковочные резьбовые пояски секций графита
      [-1.1, 0.6, 2.1].forEach(jy => {
        const joint = new THREE.Mesh(new THREE.TorusGeometry(elRadius + 0.008, 0.015, 8, 28), this.materials.darkSteel);
        joint.rotation.x = Math.PI / 2;
        joint.position.y = jy;
        elColumn.add(joint);
      });

      // Раскаленный конический рабочий торец электрода в зоне дуги
      const hotTip = new THREE.Mesh(new THREE.CylinderGeometry(elRadius, elRadius * 0.58, 0.58, 24), this.materials.electrodeTipHot);
      hotTip.position.y = -elLength / 2 + 0.29;
      elColumn.add(hotTip);

      // 5. Плазменный столб электрической дуги и ореол ионизации
      const arcCore = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.34, 0.52, 16), this.materials.arcPlasma.clone());
      arcCore.position.y = -elLength / 2 - 0.12;
      arcCore.visible = false;
      elColumn.add(arcCore);
      this.arcGlows.push(arcCore);

      const arcHalo = new THREE.Mesh(new THREE.SphereGeometry(0.48, 16, 12), this.materials.arcHalo.clone());
      arcHalo.position.y = -elLength / 2 - 0.1;
      arcHalo.visible = false;
      elColumn.add(arcHalo);
      this.arcHalos.push(arcHalo);

      phaseAssembly.add(elColumn);

      // Динамический источник света дуги конкретной фазы
      const arcLight = new THREE.PointLight(0xa3e5ff, 0, 7.5, 1.7);
      arcLight.position.set(ex, 0.45, ez);
      this.furnaceRoot.add(arcLight);
      this.arcLights.push(arcLight);

      // Сохраняем локальную точку крепления гибких водоохлаждаемых кабелей на хвосте рукава
      this.cableArmAnchors.push(new THREE.Vector3(cfg.mastX, 4.55, -4.15));

      this.electrodeGroup.add(phaseAssembly);
    });
  }

  // 5.6 Гибкие водоохлаждаемые кабели короткой сети (CatmullRomCurve3 + TubeGeometry)
  buildFlexibleCables() {
    this.cablesGroup = new THREE.Group();
    this.scene.add(this.cablesGroup);
    this.cableMeshes = [];

    // Создаем по 2 спаренных тяжелых кабеля на каждую из 3 фаз (всего 6 гирлянд)
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
    if (!this.cableMeshes || !this.transTerminals || !this.cableArmAnchors) return;

    this.cableMeshes.forEach(item => {
      const { phase, offsetX, mesh } = item;
      const pStart = this.transTerminals[phase].clone();
      pStart.x += offsetX;

      // Вычисляем мировую позицию хвоста электрододержателя с учетом подъема мачты и наклона печи
      const localAnchor = this.cableArmAnchors[phase].clone();
      localAnchor.y += this.electrodeGroup.position.y;
      this.furnaceRoot.updateMatrixWorld();
      const pEnd = localAnchor.applyMatrix4(this.furnaceRoot.matrixWorld);
      pEnd.x += offsetX;

      // Естественный провис тяжелого медного водоохлаждаемого кабеля (гирлянда)
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

  // 5.7 Струя жидкой стали при выпуске плавки из эркера EBT в ковш
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
  // 6. СОБЫТИЯ МЫШИ И КАМЕРЫ
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
  // 7. РЕЖИМЫ ВИЗУАЛИЗАЦИИ (РАЗРЕЗ / КОРПУС / ТЕРМОКАРТА)
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
      // Спектр тепловизора FLIR Ironbow: перегрев водоохлаждаемого пояса и свода
      this.materials.heavySteel.color.setHex(0x1f306e);
      this.materials.heavySteel.emissive.setHex(0x0b1338);
      this.materials.coolingPanel.color.setHex(0xd9381e);
      this.materials.coolingPanel.emissive.setHex(0x6e1405);
      this.materials.coolingPanel.emissiveIntensity = 0.65;
      this.materials.structuralBeam.color.setHex(0x131d38);
      this.materials.copperBus.emissive.setHex(0x802b00);
      this.materials.copperBus.emissiveIntensity = 0.5;
    } else {
      this.materials.heavySteel.color.setHex(0x526173);
      this.materials.heavySteel.emissive.setHex(0x000000);
      this.materials.coolingPanel.color.setHex(0x5e748c);
      this.materials.coolingPanel.emissive.setHex(0x000000);
      this.materials.coolingPanel.emissiveIntensity = 0.0;
      this.materials.structuralBeam.color.setHex(0x3e4c5e);
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
  // 8. ОБНОВЛЕНИЕ СОСТОЯНИЯ ПЕЧИ ОТ ТЕЛЕМЕТРИИ ПЛАВКИ
  // ============================================================================
  update(data = {}) {
    this.params = { ...this.params, ...data };
    const { temp_c, power_mw, stage } = this.params;

    // 1. Термодинамическое свечение жидкой ванны
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

    // 2. Механика стадий плавки: подъем электродов, отворот свода, наклон люльки, скрап
    if (stage === 'Завалка') {
      this.targetElectrodeY = 1.35;    // Полный подъем электродов
      this.targetRoofSwing = 0.52;     // Отворот свода в сторону для загрузки корзины
      this.targetTilt = 0;
      if (this.scrapGroup) {
        this.scrapGroup.visible = true;
        this.scrapGroup.scale.set(1, 1, 1);
      }
      if (this.tappingStream) this.tappingStream.visible = false;
    } else if (stage === 'Плавление') {
      this.targetElectrodeY = -0.32;   // Электроды заглублены в колодцы шихты
      this.targetRoofSwing = 0;
      this.targetTilt = 0;
      if (this.scrapGroup) {
        // По мере прогрева шихта оседает в расплав
        const meltFactor = Math.max(0, 1 - Math.max(0, (t - 950) / 600));
        this.scrapGroup.visible = meltFactor > 0.08;
        this.scrapGroup.scale.set(1, Math.max(0.1, meltFactor), 1);
      }
      if (this.tappingStream) this.tappingStream.visible = false;
    } else if (stage === 'Доводка') {
      this.targetElectrodeY = -0.12;   // Работа на короткой дуге под вспененным шлаком
      this.targetRoofSwing = 0;
      this.targetTilt = -0.035;        // Легкий наклон (2°) в сторону рабочего окна для скачивания шлака
      if (this.scrapGroup) this.scrapGroup.visible = false;
      if (this.tappingStream) this.tappingStream.visible = false;
    } else if (stage === 'Выпуск') {
      this.targetElectrodeY = 1.25;    // Электроды подняты перед наклоном
      this.targetRoofSwing = 0;
      this.targetTilt = 0.16;          // Наклон печи (~9.5°) на эркер EBT для слива стали в ковш
      if (this.scrapGroup) this.scrapGroup.visible = false;
      if (this.tappingStream) this.tappingStream.visible = true;
    }

    // 3. Электрическая дуга (зависит от активной мощности МВт)
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
  // 9. ЦИКЛ АНИМАЦИИ (60 FPS)
  // ============================================================================
  animate() {
    requestAnimationFrame(this.animate);

    const now = performance.now();
    const time = (now - this.startTime) / 1000;
    this.lastTime = now;

    // 1. Плавное демпфирование камеры
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

    // 2. Кинематика узлов печи (мачты электродов, отворот свода, наклон люльки)
    let cablesNeedUpdate = false;

    if (Math.abs(this.targetElectrodeY - this.electrodeGroup.position.y) > 0.002) {
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

    // 3. Высокочастотная пульсация электрических дуг трех фаз
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

    // 4. Циркуляция расплавленной ванны
    if (this.meltSurface) {
      this.meltSurface.rotation.y = time * 0.08;
      const pulse = 1.0 + Math.sin(time * 4.5) * 0.006;
      this.meltSurface.scale.set(pulse, 1, pulse);
    }

    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    if (this.resizeObserver) this.resizeObserver.disconnect();
    if (this.renderer && this.renderer.domElement) {
      this.renderer.domElement.remove();
    }
  }
}
