/**
 * audio.js
 * Manages BGM (generative or uploaded) and SE logic.
 * Ensures BGM volume is balanced properly against SE volume.
 */

export class AudioManager {
    constructor() {
        this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.seBuffers = {};
        this.bgmSource = null;
        this.bgmGain = this.ctx.createGain();
        this.bgmGain.connect(this.ctx.destination);
        // Default BGM volume very quiet so SE is prominent
        this.bgmGain.gain.value = 0.15;

        this.seGain = this.ctx.createGain();
        this.seGain.connect(this.ctx.destination);
        // SE volume Normal
        this.seGain.gain.value = 1.0;

        this.isGenerativePlaying = false;
        this.generativeInterval = null;

        // SE filenames
        this.seFiles = [
            '00', '01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '13', '14',
            'haiboku', 'haiboku2', 'sryouri', 'start'
        ];
    }

    async init() {
        // Load all SE into AudioBuffers for instant playback without delays
        for (const name of this.seFiles) {
            try {
                const url = `asset/se/${name}.mp3`;
                const response = await fetch(url);
                const arrayBuffer = await response.arrayBuffer();
                const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
                this.seBuffers[name] = audioBuffer;
            } catch (err) {
                console.warn(`Failed to load SE: ${name}.mp3`, err);
            }
        }

        // Load default BGM from asset/music/music.mp3
        try {
            const url = `asset/music/music.mp3`;
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            this.defaultBgmBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            console.log("Loaded default BGM asset/music/music.mp3");
        } catch (err) {
            console.warn("Could not load default BGM.", err);
        }

        // Load title BGM from asset/music/music2.mp3
        try {
            const url = `asset/music/music2.mp3`;
            const response = await fetch(url);
            const arrayBuffer = await response.arrayBuffer();
            this.titleBgmBuffer = await this.ctx.decodeAudioData(arrayBuffer);
            console.log("Loaded title BGM asset/music/music2.mp3");
        } catch (err) {
            console.warn("Could not load title BGM.", err);
        }

        console.log("Audio loading complete.");
    }

    playSE(name) {
        if (!this.seBuffers[name]) return;
        const source = this.ctx.createBufferSource();
        source.buffer = this.seBuffers[name];

        // Specific volume overrides based on user feedback
        const volOverrides = {
            '00': 2.5,
            '03': 2.5,
            '05': 2.5,
            '06': 2.5,
            '08': 2.0,
            'start': 2.0
        };

        const vol = volOverrides[name] || 1.0;
        const individualGain = this.ctx.createGain();
        individualGain.gain.value = vol;

        individualGain.connect(this.seGain);
        source.connect(individualGain);
        source.start(0);
    }

    playDropSE(itemIndex) {
        let name = itemIndex.toString().padStart(2, '0');
        if (name === '12') name = '11';
        this.playSE(name);
    }

    playWinSE() {
        this.playSE('sryouri');
    }

    playLoseSE() {
        const rand = Math.random();
        if (rand < 0.5) {
            this.playSE('haiboku');
        } else {
            this.playSE('haiboku2');
        }
    }

    // Play generic cute SE for actions like rotation or clicking
    playActionSE() {
        this.playPokoSE();
    }

    // Synthetic "poko" sound
    playPokoSE() {
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc.type = 'sine';
        const now = this.ctx.currentTime;

        // Quick frequency sweep for "poko/pop" effect
        osc.frequency.setValueAtTime(400, now);
        osc.frequency.exponentialRampToValueAtTime(150, now + 0.1);

        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);

        osc.connect(gain);
        gain.connect(this.seGain);

        osc.start(now);
        osc.stop(now + 0.1);
    }

    // --- BGM Logic ---
    startTitleBGM() {
        this.stopBGM();
        if (this.titleBgmBuffer) {
            this.bgmSource = this.ctx.createBufferSource();
            this.bgmSource.buffer = this.titleBgmBuffer;
            this.bgmSource.loop = true;
            this.bgmSource.connect(this.bgmGain);
            this.bgmSource.start(0);
        }
    }

    startDefaultBGM() {
        this.stopBGM();
        if (this.defaultBgmBuffer) {
            this.bgmSource = this.ctx.createBufferSource();
            this.bgmSource.buffer = this.defaultBgmBuffer;
            this.bgmSource.loop = true;
            this.bgmSource.connect(this.bgmGain);
            this.bgmSource.start(0);
        } else {
            this.startGenerativeBGM(); // strict fallback
        }
    }

    // Allow user to upload custom BGM
    setCustomBGM(file) {
        this.stopBGM();

        const fileReader = new FileReader();
        fileReader.onload = async (e) => {
            const arrayBuffer = e.target.result;
            const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);

            this.bgmSource = this.ctx.createBufferSource();
            this.bgmSource.buffer = audioBuffer;
            this.bgmSource.loop = true;
            this.bgmSource.connect(this.bgmGain);
            this.bgmSource.start(0);
        };
        fileReader.readAsArrayBuffer(file);
    }

    // "Yurufuwa" generative ambient music default
    startGenerativeBGM() {
        if (this.isGenerativePlaying) return;
        this.isGenerativePlaying = true;
        this.stopBGM(); // ensure any custom bgm is stopped

        // Pentatonic scale frequencies mapping (relaxing)
        // C Major Pentatonic: C4, D4, E4, G4, A4, C5
        const scale = [261.63, 293.66, 329.63, 392.00, 440.00, 523.25];

        const playTone = () => {
            if (!this.isGenerativePlaying) return;

            const osc = this.ctx.createOscillator();
            const gain = this.ctx.createGain();

            osc.type = 'sine';
            const freq = scale[Math.floor(Math.random() * scale.length)];
            osc.frequency.value = freq;

            osc.connect(gain);
            gain.connect(this.bgmGain);

            const now = this.ctx.currentTime;

            // Soft attack, long release
            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.3, now + 1.5);
            gain.gain.exponentialRampToValueAtTime(0.01, now + 5.0);

            osc.start(now);
            osc.stop(now + 5.0);

            // Schedule next tone loosely
            this.generativeInterval = setTimeout(playTone, Math.random() * 2000 + 1000);
        };

        playTone();
    }

    stopBGM() {
        if (this.bgmSource) {
            this.bgmSource.stop();
            this.bgmSource.disconnect();
            this.bgmSource = null;
        }
        if (this.isGenerativePlaying) {
            this.isGenerativePlaying = false;
            clearTimeout(this.generativeInterval);
        }
    }

    // Call this inside a user interaction like a button click
    resumeContext() {
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }
}
