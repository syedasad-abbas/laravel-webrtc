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
    const startAudioButton = document.querySelector('[data-action="start-audio-call"]');
    const statusEl = document.getElementById('call-status');
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    const waitingApprovalBanner = document.querySelector('[data-waiting-approval]');
    const hostRequestsPanel = document.querySelector('[data-host-requests]');
    const hostRequestsList = document.querySelector('[data-request-list]');
    const hostJoinAlert = document.querySelector('[data-join-alert]');
    const hostJoinAlertText = hostJoinAlert?.querySelector('[data-join-alert-text]');

    let socket;
    let peerConnection;
    let localStream;
    let remoteStream;
    let isInitiator = false;
    let readyForOffer = false;
    let hasActiveCall = false;
    let isHost = !!config.isHost;
    let isAudioOnlyMode = false;

    const iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ];

    function setStatus(message) {
        if (statusEl) {
            statusEl.textContent = message;
        }
    }

    function showWaitingApproval(message) {
        if (!waitingApprovalBanner) {
            return;
        }
        waitingApprovalBanner.hidden = false;
        const textEl = waitingApprovalBanner.querySelector('p');
        if (textEl && message) {
            textEl.textContent = message;
        }
    }

    function hideWaitingApproval() {
        if (waitingApprovalBanner) {
            waitingApprovalBanner.hidden = true;
        }
    }

    function clearHostRequests() {
        if (!hostRequestsList) {
            hideHostRequestNotice();
            return;
        }
        hostRequestsList.innerHTML = '';
        if (hostRequestsPanel) {
            hostRequestsPanel.hidden = true;
        }
        hideHostRequestNotice();
    }

    function showHostRequestNotice(text) {
        if (!hostJoinAlert) {
            return;
        }
        hostJoinAlert.hidden = false;
        if (hostJoinAlertText && text) {
            hostJoinAlertText.textContent = text;
        }
    }

    function hideHostRequestNotice() {
        if (hostJoinAlert) {
            hostJoinAlert.hidden = true;
        }
    }

    function addHostRequest(request) {
        if (!hostRequestsList || !hostRequestsPanel || !request?.id) {
            return;
        }
        removeHostRequest(request.id);
        hostRequestsPanel.hidden = false;
        const item = document.createElement('li');
        item.dataset.requestId = request.id;
        const name = request.name || 'Guest';
        item.innerHTML = `<span>${name}</span>
            <button type="button" data-action="approve-request" data-socket="${request.id}">Allow</button>`;
        hostRequestsList.appendChild(item);
        showHostRequestNotice(`${name} wants to join.`);
    }

    function removeHostRequest(id) {
        if (!hostRequestsList) {
            return;
        }
        const node = hostRequestsList.querySelector(`[data-request-id="${id}"]`);
        if (node) {
            node.remove();
        }
        if (!hostRequestsList.children.length && hostRequestsPanel) {
            hostRequestsPanel.hidden = true;
            hideHostRequestNotice();
        }
    }

    function initSocket() {
        socket = io('/', {
            path: '/socket.io',
            query: { room: config.room, isHost: config.isHost ? '1' : '0' }
        });

        socket.on('connect', () => {
            if (isHost) {
                setStatus('Connected. Waiting for participants…');
            } else {
                setStatus('Connected. Waiting for host approval…');
            }
        });

        socket.on('init', payload => {
            isInitiator = !!payload?.isInitiator;
        });

        socket.on('host', payload => {
            isHost = !!payload?.isHost;
            config.isHost = isHost;
            if (isHost) {
                hideWaitingApproval();
                setStatus('Connected. Waiting for participants…');
            } else {
                clearHostRequests();
                if (hasActiveCall) {
                    showWaitingApproval('Waiting for host approval…');
                    setStatus('Ask to join. Waiting for host approval…');
                }
            }
        });

        socket.on('ready', () => {
            readyForOffer = true;
            if (isInitiator) {
                makeOffer();
            } else if (isHost) {
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
            if (isHost && payload?.count) {
                setStatus(`Participants in room: ${payload.count}`);
            }
        });

        socket.on('join-request', request => {
            if (!isHost) {
                return;
            }
            addHostRequest(request);
            setStatus('A participant is requesting to join.');
        });

        socket.on('waiting-approval', () => {
            if (isHost) {
                return;
            }
            showWaitingApproval('Waiting for host approval…');
            setStatus('Ask to join. Waiting for host approval…');
        });

        socket.on('join-approved', () => {
            hideWaitingApproval();
            setStatus('Host approved you. Connecting…');
            ensurePeerConnection();
        });

        socket.on('promoted-host', () => {
            isHost = true;
            setStatus('You are now the host.');
        });

        socket.on('join-request-resolved', payload => {
            if (!payload?.id) {
                return;
            }
            removeHostRequest(payload.id);
        });
    }

    async function startCall(options = {}) {
        if (hasActiveCall) {
            return;
        }

        const wantsVideo = options.video !== false;
        isAudioOnlyMode = !wantsVideo;

        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: wantsVideo,
                audio: true
            });

            if (wantsVideo) {
                if (localVideo) {
                    localVideo.hidden = false;
                    localVideo.srcObject = localStream;
                }
            } else if (localVideo) {
                localVideo.srcObject = null;
                localVideo.hidden = true;
            }

            const shouldDelayConnection = !isHost;

            if (!shouldDelayConnection) {
                ensurePeerConnection();
            }

            initSocket();
            setStatus(wantsVideo ? 'Media ready. Share the link so someone can join.' : 'Audio-only mode ready. Share the link so someone can join.');
            hasActiveCall = true;
            refreshVideoButtonState();
            if (!isHost) {
                showWaitingApproval('Waiting for host approval…');
                setStatus('Ask to join. Waiting for host approval…');
            }
        } catch (error) {
            console.error(error);
            setStatus('Unable to access camera or microphone.');
        }
    }

    function ensurePeerConnection() {
        if (peerConnection) {
            return;
        }
        createPeerConnection();
        attachLocalTracks();
    }

    function attachLocalTracks() {
        if (!localStream || !peerConnection) {
            return;
        }
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
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
        const tracks = localStream.getVideoTracks();
        if (!tracks.length) {
            return;
        }
        const enabled = tracks.every(track => track.enabled);
        tracks.forEach(track => {
            track.enabled = !enabled;
        });
        refreshVideoButtonState();
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
        if (localVideo) {
            localVideo.srcObject = null;
            localVideo.hidden = false;
        }

        remoteStream = null;
        remoteVideo.srcObject = null;

        if (disconnectSocket && socket) {
            socket.disconnect();
        }

        hideWaitingApproval();
        clearHostRequests();
        isAudioOnlyMode = false;
        refreshVideoButtonState();
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

    function refreshVideoButtonState() {
        if (!videoButton) {
            return;
        }

        const tracks = localStream?.getVideoTracks() ?? [];

        if (!tracks.length) {
            if (hasActiveCall) {
                videoButton.textContent = 'Camera off';
                videoButton.disabled = true;
            } else {
                videoButton.textContent = 'Stop video';
                videoButton.disabled = false;
            }
            return;
        }

        const enabled = tracks.every(track => track.enabled);
        videoButton.textContent = enabled ? 'Stop video' : 'Start video';
        videoButton.disabled = false;
    }

    startButton?.addEventListener('click', () => startCall({ video: true }));
    startAudioButton?.addEventListener('click', () => startCall({ video: false }));
    audioButton?.addEventListener('click', toggleAudio);
    videoButton?.addEventListener('click', toggleVideo);
    hangupButton?.addEventListener('click', () => {
        endCall(true);
        setStatus('Call ended.');
    });
    copyButton?.addEventListener('click', copyLink);

    hostRequestsList?.addEventListener('click', event => {
        const button = event.target.closest('[data-action="approve-request"]');
        if (!button || !socket) {
            return;
        }
        const socketId = button.getAttribute('data-socket');
        if (!socketId) {
            return;
        }
        socket.emit('approve-join', { id: socketId });
        removeHostRequest(socketId);
    });

    window.addEventListener('beforeunload', () => {
        endCall(true);
    });
})();
