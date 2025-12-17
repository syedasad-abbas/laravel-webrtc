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
                <button type="submit" formtarget="_blank">Create meeting</button>
            </form>
        </div>
    </section>

    <section class="panel">
        <div class="panel-body">
            <h2>Join existing room</h2>
            <p class="muted">Only invited guests with the meeting link can bypass login, but you can jump in from here once you are signed in.</p>
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
                <button type="submit" formtarget="_blank">Join</button>
            </form>
        </div>
    </section>

    <section class="panel">
        <div class="panel-body">
            <h2>Active users right now</h2>
            @if ($activeUsers->isEmpty())
                <p class="muted">No teammates are currently online.</p>
            @else
                <ul class="active-users">
                    @foreach ($activeUsers as $user)
                        <li>
                            <span class="status-dot"></span>
                            <span>{{ $user->name }}</span>
                        </li>
                    @endforeach
                </ul>
            @endif
        </div>
    </section>

    @if (auth()->user()?->isAdmin())
        <section class="panel">
            <div class="panel-body">
                <h2>Add a user</h2>
                <p class="muted">Admins can provision access for new teammates. Share the generated credentials securely.</p>

                @if ($errors->createUser->any())
                    <div class="alert alert-error">
                        {{ $errors->createUser->first() }}
                    </div>
                @endif

                <form method="POST" action="{{ route('admin.users.store') }}" class="form-inline">
                    @csrf
                    <label for="new_name">Name</label>
                    <input
                        id="new_name"
                        type="text"
                        name="name"
                        value="{{ old('name') }}"
                        required
                        maxlength="60"
                    >

                    <label for="new_email">Email</label>
                    <input
                        id="new_email"
                        type="email"
                        name="email"
                        value="{{ old('email') }}"
                        required
                    >

                    <label for="new_password">Temporary password</label>
                    <input
                        id="new_password"
                        type="text"
                        name="password"
                        required
                        minlength="8"
                    >

                    <label for="new_role">Role</label>
                    <select id="new_role" name="role" required>
                        <option value="user" @selected(old('role', 'user') === 'user')>Standard user</option>
                        <option value="admin" @selected(old('role') === 'admin')>Administrator</option>
                    </select>

                    <button type="submit">Create user</button>
                </form>
            </div>
        </section>
    @endif
@endsection
