@extends('layouts.app')

@section('content')
    <section class="panel">
        <div class="panel-body">
            <h1>Create a room</h1>
            <p>Spin up a private room and share the link with anyone you'd like to talk to. No branding, just audio and video.</p>
            <form method="POST" action="{{ route('rooms.store') }}" class="form-inline">
                @csrf
                <label for="room_name">Optional room name</label>
                <input
                    id="room_name"
                    type="text"
                    name="room_name"
                    placeholder="e.g. product-sync"
                    maxlength="40"
                >
                <button type="submit">Create meeting</button>
            </form>
        </div>
    </section>

    <section class="panel">
        <div class="panel-body">
            <h2>Join existing room</h2>
            <form method="POST" action="{{ route('rooms.join') }}" class="form-inline">
                @csrf
                <label for="room">Room link or code</label>
                <input
                    id="room"
                    type="text"
                    name="room"
                    placeholder="room code"
                    required
                >
                <button type="submit">Join</button>
            </form>
        </div>
    </section>
@endsection
