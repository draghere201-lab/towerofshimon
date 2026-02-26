import { P2PManager } from './p2p.js';
import { GameManager } from './game.js';
import { AudioManager } from './audio.js';

const p2p = new P2PManager();
const game = new GameManager();
const audio = new AudioManager();

// UI Elements
const myIdInput = document.getElementById('my-id');
const friendIdInput = document.getElementById('friend-id');
const copyBtn = document.getElementById('copy-id-btn');
const connectBtn = document.getElementById('connect-btn');
const statusMsg = document.getElementById('status-msg');
const panel = document.getElementById('connection-panel');
const gameOverPanel = document.getElementById('game-over-panel');
const resultDesc = document.getElementById('result-desc');
const rematchBtn = document.getElementById('rematch-btn');
const backTitleBtn = document.getElementById('back-title-btn');
const soloBtn = document.getElementById('solo-btn');
const resultWinLose = document.getElementById('result-win-lose');
const resultTitle = document.getElementById('result-title');

// HUD Elements
const turnHud = document.getElementById('turn-hud');
const turnCount = document.getElementById('turn-count');
const turnStatus = document.getElementById('turn-status');

// Emote Elements
const emotePanel = document.getElementById('emote-panel');
const emoteDisplayContainer = document.getElementById('emote-display-container');
const emoteBtns = document.querySelectorAll('.emote-btn');

async function init() {
    // 1. Initialize Audio
    try {
        await audio.init();
        console.log('[INIT] Audio OK');
    } catch (e) {
        console.error('[INIT] Audio failed:', e);
    }

    // 2. Initialize Game Engine
    const canvasWrapper = document.getElementById('canvas-wrapper');
    try {
        await game.init(canvasWrapper);
        console.log('[INIT] Game engine OK');
    } catch (e) {
        console.error('[INIT] Game init failed:', e);
    }

    // Global hook for custom drawing / preview line
    try {
        Matter.Events.on(game.render, 'afterRender', () => {
            if (game.gameActive && game.isMyTurn && game.previewBody === null) {
                game.updatePreview();
            }
        });
    } catch (e) {
        console.error('[INIT] Matter.Events failed:', e);
    }

    // 3. Initialize P2P
    console.log('[INIT] Starting p2p.init()...');
    p2p.init((id) => {
        myIdInput.value = id;
        statusMsg.innerText = "IDを共有して対戦を待つか、相手のIDを入力してください。";
    });

    // P2P Callbacks
    p2p.onConnected = () => {
        statusMsg.innerText = "接続完了！ゲームを開始します...";
        setTimeout(() => startGame(false), 1000);
    };

    p2p.onDataReceived = (data) => {
        if (data.type === 'DROP') {
            game.myLastDrop = false; // Opponent caused this drop
            game.isDropBlocked = true; // Block my input until it settles
            game.lastDropTime = Date.now();

            game.dropItemLocally(data.itemIndex, data.xPos, data.worldY, data.scale, data.angle);
            audio.playDropSE(data.itemIndex);
            game.setTurn(true); // My turn now
            game.rollNextItem();
        } else if (data.type === 'GAME_OVER') {
            // Received game over from peer
            handleGameOver(data.isWin);
        } else if (data.type === 'REMATCH') {
            resetGameUI();
            startGame(false);
        } else if (data.type === 'ACTION') {
            audio.playActionSE();
        } else if (data.type === 'EMOTE') {
            displayEmote(data.emote, false);
        }
    };

    p2p.onConnectionLost = () => {
        alert("相手との通信が切断されました。");
        location.reload();
    };

    // Game Callbacks
    game.onItemDropped = (itemIndex, xPos, worldY, scale, angle) => {
        if (!game.isSoloMode) {
            p2p.send({ type: 'DROP', itemIndex, xPos, worldY, scale, angle });
        }
        audio.playDropSE(itemIndex);
    };

    game.onActionPerformed = () => {
        audio.playActionSE();
        if (!game.isSoloMode) {
            p2p.send({ type: 'ACTION' }); // Optional: Let opponent hear the rotation click too
        }
    };

    game.onTurnChanged = (isMyTurn, turnNum) => {
        turnCount.innerText = `Turn ${turnNum}`;
        if (game.isSoloMode) {
            turnStatus.innerText = "ソロモード (あなたの番)";
            turnHud.style.border = "3px solid #3498db";
            return;
        }

        if (isMyTurn) {
            turnStatus.innerText = "あなたの番です！";
            turnHud.style.border = "3px solid #4CAF50";
        } else {
            turnStatus.innerText = "相手の番を待っています...";
            turnHud.style.border = "3px solid #ff758c";
        }
    };

    game.onGameOver = (isWin) => {
        // I detected game over
        if (!game.isSoloMode) {
            p2p.send({ type: 'GAME_OVER', isWin: !isWin }); // Tell opponent their result
        }
        handleGameOver(isWin);
    };

    // UI Listeners
    copyBtn.addEventListener('click', () => {
        navigator.clipboard.writeText(myIdInput.value);
        copyBtn.innerText = "コピーした！";
        setTimeout(() => copyBtn.innerText = "コピー", 2000);
        audio.resumeContext();
    });

    connectBtn.addEventListener('click', () => {
        const friendId = friendIdInput.value.trim();
        if (friendId) {
            statusMsg.innerText = "接続中...";
            p2p.connectTo(friendId);
            audio.resumeContext();
        }
    });

    soloBtn.addEventListener('click', () => {
        statusMsg.innerText = "ソロモードを開始します...";
        audio.resumeContext();
        setTimeout(() => startGame(true), 500);
    });

    rematchBtn.addEventListener('click', () => {
        if (game.isSoloMode) {
            resetGameUI();
            startGame(true);
        } else {
            p2p.send({ type: 'REMATCH' });
            resetGameUI();
            startGame(false);
        }
        audio.resumeContext();
    });

    backTitleBtn.addEventListener('click', () => {
        location.reload();
    });

    emoteBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            if (!game.gameActive) return;
            const emote = e.target.getAttribute('data-emote');
            p2p.send({ type: 'EMOTE', emote });
            displayEmote(emote, true);
        });
    });

    let titleBgmStarted = false;
    document.addEventListener('pointerdown', () => {
        // Try to resume context on first interaction
        audio.resumeContext();
        // If we are on the connection panel (title screen), play title BGM
        if (!titleBgmStarted && !panel.classList.contains('hidden')) {
            audio.startTitleBGM();
            titleBgmStarted = true;
        }
    });

}

function startGame(isSolo = false) {
    game.isSoloMode = isSolo;
    panel.classList.add('hidden');
    gameOverPanel.classList.add('hidden');
    turnHud.classList.remove('hidden');

    if (isSolo) {
        emotePanel.classList.add('hidden');
    } else {
        emotePanel.classList.remove('hidden');
    }

    // Resume audio context inside user gesture just in case
    audio.resumeContext();

    // Stop Title BGM and start Game BGM
    audio.startDefaultBGM();

    audio.playSE('start');

    // Host goes first (or solo always goes first)
    game.startNewGame(isSolo ? true : p2p.isHost);
}

function handleGameOver(isWin) {
    game.gameActive = false;
    audio.stopBGM(); // Stop BGM on game over
    turnHud.classList.add('hidden');
    emotePanel.classList.add('hidden');

    // Reset win/lose animation by removing classes first
    resultWinLose.className = 'result-win-lose';
    void resultWinLose.offsetWidth; // trigger reflow to restart animation

    if (game.isSoloMode) {
        audio.playLoseSE();
        resultWinLose.innerText = "FINISH!";
        resultWinLose.classList.add("win-text", "show");
        resultTitle.innerText = "記録達成！";
        resultTitle.style.color = "#FF9800";
        resultDesc.innerText = `積んだキャラクター数: ${game.turnCount}個`;
    } else {
        if (isWin) {
            audio.playWinSE();
            resultWinLose.innerText = "WIN!";
            resultWinLose.classList.add("win-text", "show");
            resultTitle.innerText = "🎉 勝 利 🎉";
            resultTitle.style.color = "#4CAF50";
            resultDesc.innerText = `相手がタワーを崩しました！（${game.turnCount}ターン）`;
        } else {
            audio.playLoseSE();
            resultWinLose.innerText = "LOSE!";
            resultWinLose.classList.add("lose-text", "show");
            resultTitle.innerText = "💀 敗 北 💀";
            resultTitle.style.color = "#F44336";
            resultDesc.innerText = `タワーを崩してしまいました...（${game.turnCount}ターン）`;
        }
    }

    gameOverPanel.classList.remove('hidden');
}

function resetGameUI() {
    gameOverPanel.classList.add('hidden');
}

function displayEmote(emoteStr, isMine) {
    const el = document.createElement('div');
    el.className = 'floating-emote';
    el.innerText = emoteStr;

    // Position: Mine on right side, Opponent on left side
    if (isMine) {
        el.style.right = (50 + Math.random() * 50) + 'px';
        el.style.bottom = '80px';
    } else {
        el.style.left = (50 + Math.random() * 50) + 'px';
        el.style.top = '100px';
    }

    emoteDisplayContainer.appendChild(el);

    // Clean up after animation
    setTimeout(() => {
        el.remove();
    }, 2000);
}

// Global hook for custom drawing / preview line moved into init()

// Run
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
