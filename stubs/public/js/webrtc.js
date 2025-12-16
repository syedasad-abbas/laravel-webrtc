(function () {
    const config = window.meetingConfig;
    if (!config || !config.participantName) {
        return;
    }

    const participantName = config.participantName;
    const audioButton = document.querySelector('[data-action="toggle-audio"]');
    const videoButton = document.querySelector('[data-action="toggle-video"]');
    const hangupButton = document.querySelector('[data-action="hangup"]');
    const copyButton = document.querySelector('[data-action="copy-link"]');
    const deviceTestButton = document.querySelector('[data-action="device-test"]');
    const deviceCloseButton = document.querySelector('[data-action="close-device-test"]');
    const audioOnlyToggle = document.querySelector('[data-action="toggle-audio-only"]');
    const audioOnlyIndicator = document.querySelector('[data-audio-only]');
    const deviceModal = document.querySelector('[data-device-modal]');
    const deviceStatusEl = document.querySelector('[data-device-status]');
    const audioMeterBar = document.querySelector('[data-audio-level]');
    const deviceVideo = document.getElementById('deviceTestVideo');
    const statusEl = document.getElementById('call-status');
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    const localNameEl = document.getElementById('local-participant-name');
    const remoteNameEl = document.getElementById('remote-participant-name');
    const timerEl = document.querySelector('[data-timer]');

    let socket;
    let socketInitialized = false;
    let peerConnection;
    let localStream;
    let remoteStream;
    let isInitiator = false;
    let readyForOffer = false;
    let hasActiveCall = false;
    let preferAudioOnly = false;
    let timerInterval;
    let timerStartTime;
    let selfSocketId = null;
    let deviceTestStream = null;
    let usingLocalStreamForTest = false;
    let audioContext;
    let meterRaf;

    const iceServers = [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }
    ];

    function setStatus(message) {
        if (statusEl) {
            statusEl.textContent = message;
        }
    }

    function updateAudioOnlyIndicator(state) {
        preferAudioOnly = state;
        if (audioOnlyIndicator) {
            audioOnlyIndicator.hidden = !state;
        }
        if (audioOnlyToggle) {
            audioOnlyToggle.textContent = state ? 'Audio-only enabled' : 'Prefer audio only';
        }
    }

    function ensureSocket() {
        if (socketInitialized) {
            return;
        }
        socketInitialized = true;
        initSocket();
    }

    function initSocket() {
        socket = io('/', {
            path: '/socket.io',
            query: { room: config.room, name: participantName }
        });

        socket.on('connect', () => {
            selfSocketId = socket.id;
            setStatus(`Connected as ${participantName}. Share the link to invite others.`);
            if (localNameEl) {
                localNameEl.textContent = participantName;
            }
        });

        socket.on('init', payload => {
            isInitiator = !!payload?.isInitiator;
        });

        socket.on('ready', () => {
            readyForOffer = true;
            if (isInitiator) {
                makeOffer();
            } else {
                setStatus('Another participant joined. Connecting…');
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
            updateRemoteParticipant();
            stopTimer();
            if (remoteVideo) {
                remoteVideo.srcObject = null;
            }
            remoteStream = null;
        });

        socket.on('participants', payload => {
            updateParticipants(Array.isArray(payload) ? payload : []);
        });
    }

    async function startCall(forceAudioOnly = false) {
        if (hasActiveCall) {
            return;
        }

        ensureSocket();

        const useAudioOnly = forceAudioOnly || preferAudioOnly;
        const constraints = {
            audio: true,
            video: useAudioOnly ? false : { facingMode: 'user' }
        };

        try {
            localStream = await navigator.mediaDevices.getUserMedia(constraints);
            if (useAudioOnly) {
                if (localVideo) {
                    localVideo.srcObject = null;
                }
                updateAudioOnlyIndicator(true);
            } else if (localVideo) {
                localVideo.srcObject = localStream;
            }

            createPeerConnection();
            localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

            setStatus(useAudioOnly ? 'Audio-only call ready. Share the link to invite others.' : 'Media ready. Share the link to invite others.');
            hasActiveCall = true;
        } catch (error) {
            console.error('Media access failed', error);
            if (!useAudioOnly) {
                setStatus('Camera unavailable. Switching to audio only…');
                updateAudioOnlyIndicator(true);
                return startCall(true);
            }
            setStatus('Unable to access microphone. Check browser permissions.');
        }
    }

    function createPeerConnection() {
        peerConnection = new RTCPeerConnection({ iceServers });

        peerConnection.ontrack = event => {
            if (!remoteStream) {
                remoteStream = new MediaStream();
                if (remoteVideo) {
                    remoteVideo.srcObject = remoteStream;
                }
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
                startTimer();
            }
            if (['disconnected', 'failed'].includes(peerConnection.connectionState)) {
                stopTimer();
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
            setStatus('No camera stream available. Restart the call to enable video.');
            return;
        }
        const enabled = tracks.every(track => track.enabled);
        tracks.forEach(track => {
            track.enabled = !enabled;
        });
        videoButton.textContent = enabled ? 'Start video' : 'Stop video';
        if (enabled) {
            if (localVideo) {
                localVideo.srcObject = null;
            }
            updateAudioOnlyIndicator(true);
        } else if (localVideo) {
            localVideo.srcObject = localStream;
            updateAudioOnlyIndicator(false);
        }
    }

    function endCall(disconnectSocket = true) {
        stopTimer();
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
        }

        remoteStream = null;
        if (remoteVideo) {
            remoteVideo.srcObject = null;
        }

        if (disconnectSocket && socket) {
            socket.disconnect();
            socketInitialized = false;
            socket = null;
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

    function updateParticipants(list) {
        const remote = list.find(entry => entry.id !== selfSocketId);
        if (remoteNameEl) {
            remoteNameEl.textContent = remote?.name ?? 'Waiting for peer…';
        }
        if (localNameEl) {
            localNameEl.textContent = participantName;
        }
        if (list.length > 1) {
            setStatus(`Participants in room: ${list.length}`);
        } else {
            setStatus('Waiting for someone to join. Share the link.');
        }
    }

    function updateRemoteParticipant(remote = null) {
        if (remoteNameEl) {
            remoteNameEl.textContent = remote?.name ?? 'Waiting for peer…';
        }
    }

    function startTimer() {
        if (!timerEl || timerInterval) {
            return;
        }
        timerStartTime = Date.now();
        timerEl.hidden = false;
        timerInterval = setInterval(() => {
            const diff = Date.now() - timerStartTime;
            const totalSeconds = Math.floor(diff / 1000);
            const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, '0');
            const seconds = String(totalSeconds % 60).padStart(2, '0');
            timerEl.textContent = `${minutes}:${seconds}`;
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        if (timerEl) {
            timerEl.hidden = true;
            timerEl.textContent = '00:00';
        }
    }

    function openDeviceTest() {
        if (!deviceModal) {
            return;
        }
        deviceModal.hidden = false;
        if (localStream) {
            usingLocalStreamForTest = true;
            setDeviceStatus('Showing live preview from your camera.');
            attachDeviceTestStream(localStream);
        } else {
            usingLocalStreamForTest = false;
            navigator.mediaDevices.getUserMedia({ video: true, audio: true })
                .then(stream => {
                    deviceTestStream = stream;
                    attachDeviceTestStream(stream);
                    setDeviceStatus('Devices accessed successfully.');
                })
                .catch(error => {
                    console.error('Device test failed', error);
                    setDeviceStatus('Unable to access camera or microphone.');
                });
        }
    }

    function attachDeviceTestStream(stream) {
        if (deviceVideo) {
            deviceVideo.srcObject = stream;
        }
        startAudioMeter(stream);
    }

    function closeDeviceTest() {
        if (!deviceModal || deviceModal.hidden) {
            return;
        }
        deviceModal.hidden = true;
        stopAudioMeter();
        if (deviceVideo) {
            deviceVideo.srcObject = null;
        }
        if (!usingLocalStreamForTest && deviceTestStream) {
            deviceTestStream.getTracks().forEach(track => track.stop());
            deviceTestStream = null;
        }
    }

    function setDeviceStatus(message) {
        if (deviceStatusEl) {
            deviceStatusEl.textContent = message;
        }
    }

    function startAudioMeter(stream) {
        stopAudioMeter();
        if (!audioMeterBar || !stream) {
            return;
        }
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) {
            setDeviceStatus('Audio meter not supported in this browser.');
            return;
        }
        audioContext = new AudioContext();
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        const data = new Uint8Array(analyser.frequencyBinCount);

        const loop = () => {
            analyser.getByteFrequencyData(data);
            const avg = data.reduce((sum, value) => sum + value, 0) / data.length;
            const level = Math.min(100, Math.max(0, (avg / 255) * 100));
            audioMeterBar.style.width = `${level}%`;
            meterRaf = requestAnimationFrame(loop);
        };
        loop();
    }

    function stopAudioMeter() {
        if (meterRaf) {
            cancelAnimationFrame(meterRaf);
            meterRaf = null;
        }
        if (audioMeterBar) {
            audioMeterBar.style.width = '0%';
        }
        if (audioContext) {
            audioContext.close().catch(() => {});
            audioContext = null;
        }
    }

    audioButton?.addEventListener('click', toggleAudio);
    videoButton?.addEventListener('click', toggleVideo);
    hangupButton?.addEventListener('click', () => {
        closeDeviceTest();
        endCall(true);
        setStatus('Call ended.');
    });
    copyButton?.addEventListener('click', copyLink);
    audioOnlyToggle?.addEventListener('click', () => {
        const nextState = !preferAudioOnly;
        updateAudioOnlyIndicator(nextState);
        if (hasActiveCall && localStream) {
            const videoTracks = localStream.getVideoTracks();
            if (!videoTracks.length && !nextState) {
                setStatus('Restart the call to enable video.');
                updateAudioOnlyIndicator(true);
                return;
            }
            videoTracks.forEach(track => {
                track.enabled = !nextState;
            });
            if (nextState) {
                if (localVideo) {
                    localVideo.srcObject = null;
                }
            } else if (localVideo) {
                localVideo.srcObject = localStream;
            }
        } else if (!hasActiveCall && nextState && config.autoStart) {
            startCall(true);
        }
    });
    deviceTestButton?.addEventListener('click', openDeviceTest);
    deviceCloseButton?.addEventListener('click', closeDeviceTest);

    window.addEventListener('beforeunload', () => {
        closeDeviceTest();
        endCall(true);
    });

    updateAudioOnlyIndicator(false);
    ensureSocket();

    if (config.autoStart) {
        startCall();
    } else {
        setStatus('Click the call button to begin.');
    }
})();
