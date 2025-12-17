@extends('layouts.app')

@section('content')
    <div class="panel">
        <div class="panel-body">
            <div class="room-header">
                <div>
                    <h1>{{ $appName }}</h1>
                    <p class="muted">Room: <span id="room-code">{{ $room }}</span></p>
                </div>
                @if ($isHost ?? false)
                    <div class="share">
                        <input type="text" readonly value="{{ url()->current() }}" id="room-link">
                        <button type="button" data-action="copy-link">Copy link</button>
                    </div>
                @endif
            </div>
            <div class="status" id="call-status">Choose video or audio-only when you are ready.</div>
            <div class="call-alert" data-waiting-approval hidden>
                <strong>Ask to join</strong>
                <p>Waiting for the host to allow you in.</p>
            </div>
            @if ($isHost ?? false)
                <div class="call-alert host-alert" data-join-alert hidden>
                    <strong>Join request</strong>
                    <p data-join-alert-text>A participant is waiting for approval.</p>
                    <button type="button" class="host-alert-action" data-action="approve-alert-request">Allow from here</button>
                </div>
            @endif
            <div class="video-grid">
                <video id="localVideo" autoplay playsinline muted></video>
                <video id="remoteVideo" autoplay playsinline></video>
            </div>
            <div class="controls">
                <button type="button" data-action="start-call">Start video call</button>
                <button type="button" data-action="start-audio-call">Start audio-only</button>
                <button type="button" data-action="toggle-audio">Mute</button>
                <button type="button" data-action="toggle-video">Stop video</button>
                <button type="button" data-action="hangup">Leave</button>
            </div>
            <div class="pending-requests" data-host-requests hidden>
                <h3>Pending join requests</h3>
                <ul data-request-list></ul>
            </div>
        </div>
    </div>

    @if (!($isHost ?? false))
        <div class="join-gate" data-access-gate>
            <div class="join-gate-card">
                <h2>Ask to join</h2>
                <p>Click the button below to let the host know you’d like to enter this room.</p>
                <button type="button" data-action="request-access">Ask to join</button>
            </div>
        </div>
    @endif
@endsection

@push('scripts')
    <script>
        window.meetingConfig = {
            room: @json($room),
            copySuccessText: 'Link copied to clipboard',
            isHost: @json($isHost ?? false)
        };
    </script>
    <script src="/socket.io/socket.io.js"></script>
    <script src="{{ asset('js/webrtc.js') }}" defer></script>
@endpush
