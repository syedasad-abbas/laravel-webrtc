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
    const dialerPanel = document.querySelector('[data-dialer-panel]');
    const dialerForm = document.querySelector('[data-dialer-form]');
    const dialerInput = document.querySelector('[data-dialer-input]');
    const dialerLabelInput = document.querySelector('[data-dialer-label]');
    const dialerStatus = document.querySelector('[data-dialer-status]');
    const dialerButton = document.querySelector('[data-dialer-button]');
    const dialerHelper = document.querySelector('[data-dialer-helper]');
    const meetingPanel = document.querySelector('.panel .panel-body') || document.body;

    let socket;
    let peerConnection;
    let localStream;
    let remoteStream;
    let isInitiator = false;
    let readyForOffer = false;
    let hasActiveCall = false;
    let isHost = !!config.isHost;
    let isAudioOnlyMode = false;
    let socketInitialized = false;
    let dialingInProgress = false;
    let offerAttempted = false;
    let incomingCallData = null;
    let incomingCallProcessing = false;

    function logFlow(message, detail) {
        const role = isHost ? 'Host' : 'Guest';
        if (typeof detail !== 'undefined') {
            console.log(`[WebRTC][${role}] ${message}`, detail);
        } else {
            console.log(`[WebRTC][${role}] ${message}`);
        }
    }

    logFlow('Initialized meeting controller', { room: config.room, isHost });

    const iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ];

    const incomingCallBanner = createIncomingCallBanner();
    const incomingCallText = incomingCallBanner?.querySelector('[data-incoming-call-text]');
    const incomingCallApproveButton = incomingCallBanner?.querySelector('[data-incoming-call-accept]');
    const incomingCallDeclineButton = incomingCallBanner?.querySelector('[data-incoming-call-decline]');
    incomingCallApproveButton?.addEventListener('click', () => respondToIncomingCall('accept'));
    incomingCallDeclineButton?.addEventListener('click', () => respondToIncomingCall('decline'));

    function updateStartButtons() {
        const disabled = hasActiveCall;
        if (startButton) {
            startButton.disabled = disabled;
        }
        if (startAudioButton) {
            startAudioButton.disabled = disabled;
        }
    }

    function setStatus(message) {
        if (statusEl) {
            statusEl.textContent = message;
        }
    }

    function setDialerStatus(message, isError = false) {
        if (!dialerStatus) {
            return;
        }
        if (!message) {
            dialerStatus.hidden = true;
            dialerStatus.textContent = '';
            dialerStatus.classList.remove('error');
            return;
        }
        dialerStatus.hidden = false;
        dialerStatus.textContent = message;
        dialerStatus.classList.toggle('error', !!isError);
    }

    function updateDialerPanelState(helperMessage) {
        if (!dialerPanel || !dialerButton) {
            return;
        }
        if (!config.dialer?.enabled) {
            dialerButton.disabled = true;
            dialerHelper && (dialerHelper.textContent = 'Configure a PSTN provider to enable dialing.');
            return;
        }
        if (!isHost) {
            dialerButton.disabled = true;
            dialerHelper && (dialerHelper.textContent = 'Only hosts can dial out.');
            return;
        }
        if (!hasActiveCall) {
            dialerButton.disabled = true;
            dialerHelper && (dialerHelper.textContent = helperMessage || 'Start your call to enable dialing.');
            return;
        }
        if (!dialingInProgress) {
            dialerButton.disabled = false;
        }
        dialerHelper && (dialerHelper.textContent = helperMessage || 'Enter a number and click Call to dial out.');
    }

    function submitDialerRequest(event) {
        event.preventDefault();
        if (!config.dialer?.enabled || !isHost) {
            setDialerStatus('Only hosts can dial out.', true);
            return;
        }
        if (!hasActiveCall) {
            setDialerStatus('Start your call before dialing a phone number.', true);
            updateDialerPanelState();
            return;
        }
        const phoneNumber = dialerInput?.value?.trim();
        if (!phoneNumber) {
            setDialerStatus('Enter a phone number to dial.', true);
            dialerInput?.focus();
            return;
        }

        const payload = {
            phone: phoneNumber
        };
        const label = dialerLabelInput?.value?.trim();
        if (label) {
            payload.label = label;
        }

        dialingInProgress = true;
        dialerButton && (dialerButton.disabled = true);
        const dialingMessage = `Dialing ${phoneNumber}…`;
        setDialerStatus('Sending dial-out request…');
        setStatus(dialingMessage);
        updateDialerPanelState('Sending dial request…');
        logFlow('Submitting dial-out request', { phone: phoneNumber, label });
        console.log('[Dialer] Sending PSTN request', {
            phone: phoneNumber,
            label: label || null
        });

        fetch(config.dialer.endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                'X-CSRF-TOKEN': config.csrfToken
            },
            body: JSON.stringify(payload)
        }).then(async response => {
            let body = null;
            try {
                body = await response.json();
            } catch (err) {
                body = null;
            }
            if (!response.ok) {
                const error = new Error(body?.message || 'Unable to place the call.');
                error.detail = body;
                throw error;
            }
            return body;
        }).then(body => {
            const message = body?.message || dialingMessage;
            setDialerStatus(message);
            setStatus(message);
            logFlow('Dial-out request accepted', body);
            console.log('[Dialer] Provider accepted dial request', body);
            if (dialerInput) {
                dialerInput.value = '';
            }
            if (dialerLabelInput) {
                dialerLabelInput.value = '';
            }
        }).catch(error => {
            setDialerStatus(error.message || 'Unable to place the call.', true);
            setStatus(error.message || 'Dial-out request failed.');
            logFlow('Dial-out request failed', { message: error?.message });
            console.error('[Dialer] Provider rejected dial request', error);
        }).finally(() => {
            dialingInProgress = false;
            updateDialerPanelState();
            logFlow('Dial-out flow completed');
        });
    }

    function ensureSocket() {
        if (socketInitialized) {
            return;
        }
        logFlow('Initializing signaling socket');
        initSocket();
    }

    function initSocket() {
        if (socketInitialized) {
            return;
        }
        socketInitialized = true;
        logFlow('Connecting to signaling server', { room: config.room });
        socket = io('/', {
            path: '/socket.io',
            query: { room: config.room, isHost: config.isHost ? '1' : '0' }
        });

        socket.on('connect', () => {
            logFlow('Socket connected', { id: socket.id });
            setStatus(isHost ? 'Connected. Waiting for participants…' : 'Connected. Waiting for host.');
        });
        socket.on('disconnect', reason => {
            logFlow('Socket disconnected', { reason });
        });

        socket.on('init', payload => {
            isInitiator = !!payload?.isInitiator;
            logFlow('Received init event', { isInitiator });
        });

        socket.on('host', payload => {
            isHost = !!payload?.isHost;
            config.isHost = isHost;
            logFlow('Received host role update', { isHost });
            setStatus(isHost ? 'Connected. Waiting for participants…' : 'Connected. Waiting for host.');
            updateDialerPanelState(isHost ? undefined : 'Waiting for host.');
        });

        socket.on('incoming-call', payload => {
            if (!isHost || !payload) {
                return;
            }
            logFlow('Incoming phone call signal', payload);
            showIncomingCall(payload);
        });

        socket.on('incoming-call-cancelled', payload => {
            if (!incomingCallData || (payload?.callId && payload.callId !== incomingCallData.callId)) {
                return;
            }
            logFlow('Incoming phone call cancelled', payload);
            clearIncomingCallBanner('Caller left the line.');
        });

        socket.on('incoming-call-connected', payload => {
            if (!incomingCallData || (payload?.callId && payload.callId !== incomingCallData.callId)) {
                return;
            }
            logFlow('Incoming phone participant connected', payload);
            clearIncomingCallBanner('Phone participant connected.');
        });

        socket.on('ready', () => {
            readyForOffer = true;
            offerAttempted = false;
            logFlow('Signaling ready event received', { isInitiator });
            if (isInitiator) {
                maybeMakeOffer();
            } else if (isHost) {
                setStatus('Another participant joined. Preparing connection…');
            }
        });

        socket.on('offer', async offer => {
            logFlow('Received offer', { hasPeerConnection: !!peerConnection });
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
                logFlow('Answer received before peer connection was ready');
                return;
            }
            logFlow('Received answer from peer');
            await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        });

        socket.on('ice-candidate', async candidate => {
            logFlow('Received remote ICE candidate', {
                sdpMid: candidate?.sdpMid,
                sdpMLineIndex: candidate?.sdpMLineIndex
            });
            try {
                await peerConnection?.addIceCandidate(candidate);
            } catch (err) {
                console.error('Failed to add ICE candidate', err);
            }
        });

        socket.on('peer-left', () => {
            logFlow('Peer left the room');
            setStatus('The other participant left the room.');
            endCall(false);
        });

        socket.on('participants', payload => {
            if (isHost && payload?.count) {
                logFlow('Participant count update', payload);
                setStatus(`Participants in room: ${payload.count}`);
            }
        });

        socket.on('promoted-host', () => {
            isHost = true;
            logFlow('Promoted to host');
            setStatus('You are now the host.');
            updateDialerPanelState();
        });
    }

    async function startCall(options = {}) {
        if (hasActiveCall) {
            return;
        }

        const wantsVideo = options.video !== false;
        isAudioOnlyMode = !wantsVideo;
        logFlow('Start call requested', { wantsVideo });

        try {
            localStream = await navigator.mediaDevices.getUserMedia({
                video: wantsVideo,
                audio: true
            });
            logFlow('Media permissions granted', {
                audioTracks: localStream.getAudioTracks().length,
                videoTracks: localStream.getVideoTracks().length
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

            hasActiveCall = true;
            ensureSocket();
            ensurePeerConnection();
            socket?.emit('call-ready', { video: wantsVideo });
            logFlow('Emitted call-ready signal', { wantsVideo });
            const hostStatus = wantsVideo ? 'Media ready. Share the link so someone can join.' : 'Audio-only mode ready. Share the link so someone can join.';
            const guestStatus = wantsVideo ? 'Media ready. Waiting for the host to connect…' : 'Audio-only mode ready. Waiting for the host to connect…';
            setStatus(isHost ? hostStatus : guestStatus);
            updateStartButtons();
            refreshVideoButtonState();
            updateDialerPanelState();
        } catch (error) {
            console.error(error);
            logFlow('Failed to start local media', { message: error?.message });
            setStatus('Unable to access camera or microphone.');
            hasActiveCall = false;
            updateStartButtons();
            updateDialerPanelState();
            socket?.emit('call-ended');
        }
    }

    function ensurePeerConnection() {
        if (peerConnection) {
            logFlow('Peer connection already established');
            return;
        }
        logFlow('Creating new peer connection');
        createPeerConnection();
        attachLocalTracks();
        maybeMakeOffer();
    }

    function attachLocalTracks() {
        if (!localStream || !peerConnection) {
            return;
        }
        logFlow('Attaching local media tracks to peer connection');
        localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    }

    function createPeerConnection() {
        peerConnection = new RTCPeerConnection({ iceServers });
        logFlow('Peer connection created');

        peerConnection.ontrack = event => {
            if (!remoteStream) {
                remoteStream = new MediaStream();
                remoteVideo.srcObject = remoteStream;
            }
            logFlow('Remote track received', { kind: event.track?.kind });
            remoteStream.addTrack(event.track);
        };

        peerConnection.onicecandidate = event => {
            if (event.candidate && socket?.connected) {
                logFlow('Local ICE candidate discovered', {
                    sdpMid: event.candidate.sdpMid,
                    sdpMLineIndex: event.candidate.sdpMLineIndex
                });
                socket.emit('ice-candidate', event.candidate);
            }
        };

        peerConnection.onconnectionstatechange = () => {
            logFlow('Peer connection state changed', { state: peerConnection.connectionState });
            if (peerConnection.connectionState === 'connected') {
                setStatus('You are live!');
            }
        };
    }

    function maybeMakeOffer() {
        if (!readyForOffer || offerAttempted) {
            logFlow('Skipping offer attempt', { readyForOffer, offerAttempted });
            return;
        }
        if (!isInitiator || !peerConnection || !localStream || !hasActiveCall) {
            logFlow('Cannot make offer yet', {
                isInitiator,
                hasPeerConnection: !!peerConnection,
                hasLocalStream: !!localStream,
                hasActiveCall
            });
            return;
        }
        offerAttempted = true;
        logFlow('Creating offer for peer');
        makeOffer().catch(() => {
            offerAttempted = false;
            logFlow('Offer creation failed, will retry on next ready event');
        });
    }

    async function makeOffer() {
        if (!peerConnection || !readyForOffer) {
            return;
        }

        const offer = await peerConnection.createOffer();
        logFlow('Local description created', { type: offer.type });
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
        logFlow('Audio tracks toggled', { muted: enabled });
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
        logFlow('Video tracks toggled', { cameraEnabled: !enabled });
        refreshVideoButtonState();
    }

    function endCall(disconnectSocket = true) {
        const wasActive = hasActiveCall;
        hasActiveCall = false;
        readyForOffer = false;
        logFlow('Ending call', { disconnectSocket, wasActive });
        if (wasActive && socket) {
            socket.emit('call-ended');
        }
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

        isAudioOnlyMode = false;
        offerAttempted = false;
        refreshVideoButtonState();
        updateStartButtons();
        setDialerStatus('');
        updateDialerPanelState();
        clearIncomingCallBanner();
    }

    async function copyLink() {
        try {
            const input = document.getElementById('room-link');
            await navigator.clipboard.writeText(input.value);
            setStatus(config.copySuccessText);
            logFlow('Copied room link to clipboard');
        } catch (error) {
            console.warn('Clipboard copy failed', error);
            logFlow('Failed to copy room link', { message: error?.message });
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

    function createIncomingCallBanner() {
        if (!meetingPanel) {
            return null;
        }

        const container = document.createElement('div');
        container.className = 'incoming-call-banner alert alert-warning';
        container.hidden = true;
        container.innerHTML = `
            <div class="incoming-call-message">
                <strong>Incoming phone call</strong>
                <p data-incoming-call-text class="muted"></p>
            </div>
            <div class="incoming-call-actions">
                <button type="button" data-incoming-call-accept>Approve & connect</button>
                <button type="button" data-incoming-call-decline class="link-button">Decline</button>
            </div>
        `;
        meetingPanel.insertBefore(container, meetingPanel.firstChild);

        return container;
    }

    function showIncomingCall(payload) {
        incomingCallData = {
            callId: payload.callId || payload.id,
            caller: payload.caller || payload.from || 'Unknown caller',
            number: payload.number || payload.phone || payload.from,
            metadata: payload.metadata || null
        };
        logFlow('Displaying incoming call banner', incomingCallData);

        if (!incomingCallBanner || !incomingCallText) {
            return;
        }

        const parts = [];
        if (incomingCallData.caller) {
            parts.push(incomingCallData.caller);
        }
        if (incomingCallData.number && incomingCallData.number !== incomingCallData.caller) {
            parts.push(`(${incomingCallData.number})`);
        }
        incomingCallText.textContent = `${parts.join(' ')} wants to join via phone.`;
        incomingCallBanner.hidden = false;
        setIncomingButtonsDisabled(false);

        if (!hasActiveCall) {
            setStatus('Incoming phone call pending. Start the meeting to connect.');
        } else {
            setStatus('Incoming phone call pending approval.');
        }
    }

    function clearIncomingCallBanner(message) {
        incomingCallData = null;
        logFlow('Clearing incoming call banner', { message });
        if (incomingCallBanner) {
            incomingCallBanner.hidden = true;
        }
        setIncomingButtonsDisabled(false);
        if (message) {
            setStatus(message);
        }
    }

    function setIncomingButtonsDisabled(disabled) {
        if (incomingCallApproveButton) {
            incomingCallApproveButton.disabled = disabled;
        }
        if (incomingCallDeclineButton) {
            incomingCallDeclineButton.disabled = disabled;
        }
    }

    async function respondToIncomingCall(action) {
        if (!incomingCallData || incomingCallProcessing) {
            return;
        }

        incomingCallProcessing = true;
        logFlow('Responding to incoming call', { action, callId: incomingCallData.callId });
        setIncomingButtonsDisabled(true);
        const callId = incomingCallData.callId;
        const endpoint = config.dialer?.incoming?.endpoint;

        try {
            if (endpoint) {
                const response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-CSRF-TOKEN': config.csrfToken
                    },
                    body: JSON.stringify({ callId, action })
                });
                if (!response.ok) {
                    const errorBody = await safeReadJson(response);
                    throw new Error(errorBody?.message || 'Unable to process incoming call.');
                }
            }

            socket?.emit('incoming-call-response', { callId, action });

            if (action === 'accept') {
                logFlow('Incoming call approved', { callId });
                clearIncomingCallBanner('Incoming call approved. Connecting phone participant…');
            } else {
                logFlow('Incoming call declined', { callId });
                clearIncomingCallBanner('Incoming call declined.');
            }
        } catch (error) {
            console.error(error);
            logFlow('Failed to respond to incoming call', { message: error?.message });
            setStatus(error.message || 'Unable to process incoming call.');
            setIncomingButtonsDisabled(false);
        } finally {
            incomingCallProcessing = false;
            logFlow('Incoming call response completed', { action });
        }
    }

    async function safeReadJson(response) {
        try {
            return await response.json();
        } catch (error) {
            return null;
        }
    }

    startButton?.addEventListener('click', () => {
        logFlow('Start video call button clicked');
        startCall({ video: true });
    });
    startAudioButton?.addEventListener('click', () => {
        logFlow('Start audio-only call button clicked');
        startCall({ video: false });
    });
    audioButton?.addEventListener('click', toggleAudio);
    videoButton?.addEventListener('click', toggleVideo);
    hangupButton?.addEventListener('click', () => {
        logFlow('Hangup button clicked');
        endCall(true);
        setStatus('Call ended.');
    });
    copyButton?.addEventListener('click', copyLink);

    dialerForm?.addEventListener('submit', submitDialerRequest);

    updateStartButtons();
    ensureSocket();
    updateDialerPanelState();

    window.addEventListener('beforeunload', () => {
        logFlow('Window unloading; cleaning up call state');
        endCall(true);
    });
})();
