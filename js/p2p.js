export class P2PManager {
    constructor() {
        this.peer = null;
        this.connection = null;
        this.isHost = false;

        // Callbacks
        this.onConnected = () => { };
        this.onDataReceived = (data) => { };
        this.onConnectionLost = () => { };
    }

    init(onOpenCallback) {
        // Initialize PeerJS
        console.log('[P2P] Initializing PeerJS...');
        try {
            this.peer = new Peer();
        } catch (e) {
            console.error('[P2P] Failed to create Peer:', e);
            return;
        }

        this.peer.on('open', (id) => {
            console.log('[P2P] My peer ID is: ' + id);
            if (onOpenCallback) onOpenCallback(id);
        });

        // Listen for incoming connections (Host mode)
        this.peer.on('connection', (conn) => {
            if (this.connection) {
                // Already connected to someone
                conn.send({ type: 'error', message: 'Room is full' });
                setTimeout(() => conn.close(), 500);
                return;
            }

            this.isHost = true;
            this.connection = conn;
            this.setupConnectionHandlers();
        });

        this.peer.on('error', (err) => {
            console.error('PeerJS error:', err);
            alert('通信エラーが発生しました: ' + err.message);
        });
    }

    connectTo(friendId) {
        if (this.connection) {
            this.connection.close();
        }

        this.isHost = false;
        this.connection = this.peer.connect(friendId);
        this.setupConnectionHandlers();
    }

    setupConnectionHandlers() {
        this.connection.on('open', () => {
            console.log('Connected to peer!');
            this.onConnected();
        });

        this.connection.on('data', (data) => {
            this.onDataReceived(data);
        });

        this.connection.on('close', () => {
            console.log('Connection closed');
            this.connection = null;
            this.onConnectionLost();
        });
    }

    send(data) {
        if (this.connection && this.connection.open) {
            this.connection.send(data);
        }
    }
}
