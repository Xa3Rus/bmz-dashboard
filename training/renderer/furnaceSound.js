// Звуковой движок реального времени технологических процессов ДСП-135 (Web Audio API)
// Эксклюзивно для обучающего тренажёра (training/) — синтез звуков дуги, кислородной продувки и гидроприводов без внешних аудиофайлов

class FurnaceSoundEngine {
  constructor() {
    this.ctx = null;
    this.enabled = false;
    this.masterGain = null;

    // Генераторы дуги (100 Гц гул переменного тока + гармоники)
    this.arcOsc1 = null;
    this.arcOsc2 = null;
    this.arcGain = null;
    this.arcNoiseNode = null;
    this.arcNoiseGain = null;

    // Кислородная фурма (высокочастотное шипение)
    this.o2NoiseNode = null;
    this.o2Filter = null;
    this.o2Gain = null;

    // Гидропривод свода и наклона (низкочастотный моторный гул)
    this.hydrOsc = null;
    this.hydrGain = null;
  }

  init() {
    if (this.ctx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;

    this.ctx = new AudioCtx();
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0.35, this.ctx.currentTime);
    this.masterGain.connect(this.ctx.destination);

    // 1. Создание генератора электрической дуги
    this.arcOsc1 = this.ctx.createOscillator();
    this.arcOsc1.type = 'sawtooth';
    this.arcOsc1.frequency.setValueAtTime(100, this.ctx.currentTime); // 100 Гц пульсация 50 Гц дуги

    this.arcOsc2 = this.ctx.createOscillator();
    this.arcOsc2.type = 'sine';
    this.arcOsc2.frequency.setValueAtTime(200, this.ctx.currentTime); // 2-я гармоника

    this.arcGain = this.ctx.createGain();
    this.arcGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.arcOsc1.connect(this.arcGain);
    this.arcOsc2.connect(this.arcGain);
    this.arcGain.connect(this.masterGain);

    this.arcOsc1.start();
    this.arcOsc2.start();

    // Белый/розовый шум плазмы дуги
    const bufferSize = this.ctx.sampleRate * 2;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const output = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      output[i] = Math.random() * 2 - 1;
    }

    this.arcNoiseNode = this.ctx.createBufferSource();
    this.arcNoiseNode.buffer = noiseBuffer;
    this.arcNoiseNode.loop = true;

    const arcNoiseFilter = this.ctx.createBiquadFilter();
    arcNoiseFilter.type = 'bandpass';
    arcNoiseFilter.frequency.setValueAtTime(650, this.ctx.currentTime);
    arcNoiseFilter.Q.setValueAtTime(1.8, this.ctx.currentTime);

    this.arcNoiseGain = this.ctx.createGain();
    this.arcNoiseGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.arcNoiseNode.connect(arcNoiseFilter);
    arcNoiseFilter.connect(this.arcNoiseGain);
    this.arcNoiseGain.connect(this.masterGain);
    this.arcNoiseNode.start();

    // 2. Кислородная фурма (шипение сверхзвуковой струи)
    this.o2NoiseNode = this.ctx.createBufferSource();
    this.o2NoiseNode.buffer = noiseBuffer;
    this.o2NoiseNode.loop = true;

    this.o2Filter = this.ctx.createBiquadFilter();
    this.o2Filter.type = 'highpass';
    this.o2Filter.frequency.setValueAtTime(1400, this.ctx.currentTime);

    this.o2Gain = this.ctx.createGain();
    this.o2Gain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.o2NoiseNode.connect(this.o2Filter);
    this.o2Filter.connect(this.o2Gain);
    this.o2Gain.connect(this.masterGain);
    this.o2NoiseNode.start();

    // 3. Гидропривод свода и наклона
    this.hydrOsc = this.ctx.createOscillator();
    this.hydrOsc.type = 'triangle';
    this.hydrOsc.frequency.setValueAtTime(45, this.ctx.currentTime);

    this.hydrGain = this.ctx.createGain();
    this.hydrGain.gain.setValueAtTime(0, this.ctx.currentTime);

    this.hydrOsc.connect(this.hydrGain);
    this.hydrGain.connect(this.masterGain);
    this.hydrOsc.start();
  }

  toggle() {
    this.init();
    if (!this.ctx) return false;

    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.silence();
    }
    return this.enabled;
  }

  silence() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.arcGain?.gain.setTargetAtTime(0, now, 0.1);
    this.arcNoiseGain?.gain.setTargetAtTime(0, now, 0.1);
    this.o2Gain?.gain.setTargetAtTime(0, now, 0.1);
    this.hydrGain?.gain.setTargetAtTime(0, now, 0.1);
  }

  update(params = {}) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;

    const power_mw = Number(params.power_mw) || 0;
    const stage = params.stage || 'Плавление';

    // 1. Управление дугой
    if (power_mw > 1.0 && (stage === 'Плавление' || stage === 'Доводка')) {
      const pNorm = Math.min(1.0, power_mw / 48);
      const arcVol = 0.08 + pNorm * 0.42;
      this.arcGain.gain.setTargetAtTime(arcVol, now, 0.15);
      this.arcNoiseGain.gain.setTargetAtTime(pNorm * 0.35, now, 0.15);
    } else {
      this.arcGain.gain.setTargetAtTime(0, now, 0.12);
      this.arcNoiseGain.gain.setTargetAtTime(0, now, 0.12);
    }

    // 2. Кислородная фурма
    if (stage === 'Плавление' || stage === 'Доводка') {
      this.o2Gain.gain.setTargetAtTime(0.12, now, 0.2);
    } else {
      this.o2Gain.gain.setTargetAtTime(0, now, 0.15);
    }

    // 3. Гидроприводы (Завалка = отвод свода, Выпуск = наклон люльки)
    if (stage === 'Завалка' || stage === 'Выпуск') {
      this.hydrGain.gain.setTargetAtTime(0.15, now, 0.2);
    } else {
      this.hydrGain.gain.setTargetAtTime(0, now, 0.2);
    }
  }
}

window.furnaceSound = new FurnaceSoundEngine();
