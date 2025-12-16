<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="csrf-token" content="{{ csrf_token() }}">
    <title>{{ config('app.name', 'Laravel WebRTC') }}</title>
    <link rel="stylesheet" href="{{ asset('css/app.css') }}">
    @stack('head')
</head>
<body>
    <header class="app-header">
        <div class="container header-content">
            <a href="{{ route('home') }}" class="brand">{{ config('app.name', 'Laravel WebRTC') }}</a>
            <span class="tagline">Minimal WebRTC meetings</span>
        </div>
    </header>
    <main class="container">
        @if (session('error'))
            <div class="alert alert-error">
                {{ session('error') }}
            </div>
        @endif
        @yield('content')
    </main>
    @stack('scripts')
</body>
</html>
