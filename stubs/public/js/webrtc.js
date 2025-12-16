(function () {
    const config = window.meetingConfig;
    if (!config) {
        return;
    }

    const startButton = document.querySelector('[data-action="start-call"]');
    const audioButton = document.querySelector('[data-action="toggle-audio"]');
    const videoButton = document.querySelector('[data-action="toggle-video"]');
    const hangupButton = document.querySelector('[data-action="hangup"]');
    const copyButton = document.querySelector('[data-action="copy-link"]');
    const statusEl = document.getElementById('call-status');
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');

    let socket;
    let peerConnection;
    let localStream;
    let remoteStream;
    let isInitiator = false;
    let readyForOffer = false;
    let hasActiveCall = false;

    const iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ];

    function setStatus(message) {
        if (statusEl) {
            statusEl.textContent = message;
        }
    }

    function initSocket() {
        socket = io('/', {
            path: '/socket.io',
            query: { room: config.room }
        });

        socket.on('connect', () => {
            setStatus('Connected. Waiting for participants…');
        });

        socket.on('init', payload => {
            isInitiator = !!payload?.isInitiator;
        });

        socket.on('ready', () => {
            readyForOffer = true;
            if (isInitiator) {
                makeOffer();
            } else {
                setStatus('Another participant joined. Preparing connection…');
            }
        });

        socket.on('offer', async offer => {
            if (!peerConnection) {
                createPeerConnection();
            }
            await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            socket.emit('answer', answer);
        });

        socket.on('answer', async answer => {
            if (!peerConnection) {
                return;
            }
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        });

        socket.on('ice-candidate', async candidate => {
            try {
                await peerConnection?.addIceCandidate(candidate);
            } catch (err) {
                console.error('Failed to add ICE candidate', err);
            }
        });

        socket.on('peer-left', () => {
            setStatus('The other participant left the room.');
            endCall(false);
        });

        socket.on('participants', payload => {
            if (payload?.count) {
                setStatus(`Participants in room: ${payload.count}`);
            }
        });
    }

    async function startCall() {
        if (hasActiveCall) {
            return;
        }

        try {
            localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
            localVideo.srcObject = localStream;
            createPeerConnection();
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
            initSocket();
            setStatus('Media ready. Share the link so someone can join.');
            hasActiveCall = true;
        } catch (error) {
            console.error(error);
            setStatus('Unable to access camera or microphone.');
        }
    }

    function createPeerConnection() {
        peerConnection = new RTCPeerConnection({ iceServers });

        peerConnection.ontrack = event => {
            if (!remoteStream) {
                remoteStream = new MediaStream();
                remoteVideo.srcObject = remoteStream;
            }
            remoteStream.addTrack(event.track);
        };

        peerConnection.onicecandidate = event => {
            if (event.candidate && socket?.connected) {
                socket.emit('ice-candidate', event.candidate);
            }
        };

        peerConnection.onconnectionstatechange = () => {
            if (peerConnection.connectionState === 'connected') {
                setStatus('You are live!');
            }
        };
    }

    async function makeOffer() {
        if (!peerConnection || !readyForOffer) {
            return;
        }

        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket?.emit('offer', offer);
        setStatus('Calling peer…');
    }

    function toggleAudio() {
        if (!localStream) {
            return;
        }
        const enabled = localStream.getAudioTracks().every(track => track.enabled);
        localStream.getAudioTracks().forEach(track => {
            track.enabled = !enabled;
        });
        audioButton.textContent = enabled ? 'Unmute' : 'Mute';
    }

    function toggleVideo() {
        if (!localStream) {
            return;
        }
        const enabled = localStream.getVideoTracks().every(track => track.enabled);
        localStream.getVideoTracks().forEach(track => {
            track.enabled = !enabled;
        });
        videoButton.textContent = enabled ? 'Start video' : 'Stop video';
    }

    function endCall(disconnectSocket = true) {
        hasActiveCall = false;
        readyForOffer = false;
        if (peerConnection) {
            peerConnection.getSenders().forEach(sender => {
                sender.track?.stop();
            });
            peerConnection.close();
        }
        peerConnection = null;

        localStream?.getTracks().forEach(track => track.stop());
        localStream = null;
        localVideo.srcObject = null;

        remoteStream = null;
        remoteVideo.srcObject = null;

        if (disconnectSocket && socket) {
            socket.disconnect();
        }
    }

    async function copyLink() {
        try {
            const input = document.getElementById('room-link');
            await navigator.clipboard.writeText(input.value);
            setStatus(config.copySuccessText);
        } catch (error) {
            console.warn('Clipboard copy failed', error);
        }
    }

    startButton?.addEventListener('click', startCall);
    audioButton?.addEventListener('click', toggleAudio);
    videoButton?.addEventListener('click', toggleVideo);
    hangupButton?.addEventListener('click', () => {
        endCall(true);
        setStatus('Call ended.');
    });
    copyButton?.addEventListener('click', copyLink);

    window.addEventListener('beforeunload', () => {
        endCall(true);
    });
})();
