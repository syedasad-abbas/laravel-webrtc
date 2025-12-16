@extends('layouts.app')

@section('content')
    <div class="panel">
        <div class="panel-body">
            <div class="room-header">
                <div>
                    <h1>{{ $appName }}</h1>
                    <p class="muted">Room: <span id="room-code">{{ $room }}</span></p>
                </div>
                <div class="share">
                    <input type="text" readonly value="{{ url()->current() }}" id="room-link">
                    <button type="button" data-action="copy-link">Copy link</button>
                </div>
            </div>
            <div class="status" id="call-status">Preparing call…</div>
            <div class="audio-only-toggle">
                <button type="button" data-action="toggle-audio-only">Prefer audio only</button>
                <span class="audio-only-indicator" data-audio-only hidden>Audio-only mode enabled</span>
            </div>
            <div class="call-timer" data-timer hidden>00:00</div>
            <div class="video-grid">
                <div class="video-wrapper">
                    <video id="localVideo" autoplay playsinline muted></video>
                    <span class="name-badge" id="local-participant-name">{{ $participantName ?? 'You' }}</span>
                </div>
                <div class="video-wrapper">
                    <video id="remoteVideo" autoplay playsinline></video>
                    <span class="name-badge" id="remote-participant-name">Waiting for peer…</span>
                </div>
            </div>
            <div class="controls">
                <button type="button" data-action="device-test">Test devices</button>
                <button type="button" data-action="toggle-audio">Mute</button>
                <button type="button" data-action="toggle-video">Stop video</button>
                <button type="button" data-action="hangup">Leave</button>
            </div>
        </div>
    </div>

    @if (! $participantName)
        <div class="name-overlay">
            <div class="name-modal">
                <h2>Enter your name to join</h2>
                <form method="POST" action="{{ route('rooms.enter', ['code' => $room]) }}">
                    @csrf
                    <label for="participant_name_room">Display name</label>
                    <input id="participant_name_room" type="text" name="participant_name" maxlength="40" required autofocus>
                    <button type="submit">Join room</button>
                </form>
            </div>
        </div>
    @endif

    <div data-device-modal hidden>
        <div class="device-modal-body">
            <h2>Device test</h2>
            <p data-device-status>Checking devices…</p>
            <video id="deviceTestVideo" autoplay playsinline muted></video>
            <div class="audio-meter">
                <div class="audio-meter-bar" data-audio-level></div>
            </div>
            <div class="device-actions">
                <button type="button" data-action="close-device-test">Done</button>
            </div>
        </div>
    </div>
@endsection

@push('scripts')
    <script>
        window.meetingConfig = {
            room: @json($room),
            participantName: @json($participantName),
            autoStart: @json((bool) $participantName),
            copySuccessText: 'Link copied to clipboard'
        };
    </script>
    <script src="/socket.io/socket.io.js"></script>
    <script src="{{ asset('js/webrtc.js') }}" defer></script>
@endpush
