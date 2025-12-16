<?php

use App\Http\Controllers\RoomController;
use Illuminate\Support\Facades\Route;

Route::get('/', [RoomController::class, 'index'])->name('home');
Route::post('/rooms', [RoomController::class, 'store'])->name('rooms.store');
Route::post('/rooms/join', [RoomController::class, 'join'])->name('rooms.join');
Route::get('/rooms/{code}', [RoomController::class, 'show'])->name('rooms.show');
