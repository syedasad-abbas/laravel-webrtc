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
