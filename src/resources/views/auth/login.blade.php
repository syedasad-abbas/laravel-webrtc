@extends('layouts.app')

@section('content')
    <section class="panel auth-panel">
        <div class="panel-body">
            <h1>Sign in</h1>
            <p class="muted">Use your email and password to access the meeting dashboard.</p>

            @if ($errors->any())
                <div class="alert alert-error">
                    {{ $errors->first() }}
                </div>
            @endif

            <form method="POST" action="{{ route('login.store') }}" class="form-inline">
                @csrf
                <label for="email">Email address</label>
                <input
                    id="email"
                    type="email"
                    name="email"
                    value="{{ old('email') }}"
                    required
                    autofocus
                >

                <label for="password">Password</label>
                <input
                    id="password"
                    type="password"
                    name="password"
                    required
                >

                <button type="submit">Log in</button>
            </form>
        </div>
    </section>
@endsection
