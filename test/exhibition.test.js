import { test } from 'node:test';
import assert from 'node:assert/strict';
import { sceneAt, letterAt, filmOffsets, advanceFilm, FILM_IDLE_SPEED } from '../src/exhibition.js';

test('native scroll keeps chapter, visibility and boundaries in sync', () => {
  for (let i = 0; i < 4; i++) {
    const state = sceneAt(i * 1000, 3000);
    assert.equal(state.chapter, i);
    assert.equal(state.visibility[i], 1);
    assert.equal(state.visibility.filter(Boolean).length, 1);
  }
  assert.equal(sceneAt(-50, 3000).progress, 0);
  assert.equal(sceneAt(8000, 3000).progress, 3);
  assert.equal(sceneAt(100, 0).progress, 0);
  assert.equal(sceneAt(500, 3000).chapter, 1);
  assert.ok(sceneAt(500, 3000).visibility.every(Number.isFinite));
});

test('film lanes advance equally in opposite directions and reverse with page scroll', () => {
  const earlier = filmOffsets(200, 3000);
  const later = filmOffsets(800, 3000);
  assert.ok(later.down > earlier.down);
  assert.ok(later.up < earlier.up);
  assert.equal(later.down, -later.up);
  assert.deepEqual(filmOffsets(200, 3000), earlier);
  assert.equal(filmOffsets(-100, 3000).down, 0);
  assert.deepEqual(filmOffsets(5000, 3000), filmOffsets(3000, 3000));
  assert.equal(filmOffsets(100, 0).down, 0);
});

test('one sheet leaves above, wraps invisibly, returns below and rests without the machine', () => {
  assert.equal(letterAt(0).travel, 0);
  assert.equal(letterAt(0).machine, 1);
  assert.ok(letterAt(.3).travel < letterAt(.15).travel);
  assert.ok(letterAt(.44).travel < -100);
  for (const progress of [.44, .47, .48, .5, .52]) assert.equal(letterAt(progress).opacity, 0);
  assert.ok(letterAt(.52).travel > 100);
  assert.ok(letterAt(.6).travel > letterAt(.8).travel);
  const settled = letterAt(1);
  assert.equal(settled.travel, 0);
  assert.equal(settled.memory, 1);
  assert.equal(settled.opacity, 1);
  assert.equal(settled.machine, 0);
  assert.equal(letterAt(2).opacity, 0);
  assert.equal(letterAt(2).machine, 0);
  assert.equal(letterAt(3).memory, 0);
  assert.equal(letterAt(3).opacity, 1);
  assert.equal(letterAt(3).machine, 1);
  for (const progress of [3, 2, 1, .8, .5, .2, 0, -1, 4]) {
    const state = letterAt(progress);
    assert.ok(Object.values(state).every(Number.isFinite));
    assert.ok(state.opacity >= 0 && state.opacity <= 1);
    assert.ok(state.machine >= 0 && state.machine <= 1);
    assert.deepEqual(letterAt(progress, true), letterAt(Math.round(progress)));
  }
});

test('film drifts when idle, accelerates with pointer input, then smoothly returns to idle', () => {
  let film = { offset: 0, speed: FILM_IDLE_SPEED, boost: 0 };
  for (let i = 0; i < 60; i++) film = advanceFilm(film, 1 / 60);
  assert.ok(Math.abs(film.offset - 12) < .001);
  film.boost = 500;
  const first = advanceFilm(film, 1 / 60);
  assert.ok(first.speed > FILM_IDLE_SPEED && first.speed < FILM_IDLE_SPEED + 500);
  assert.ok(first.offset > film.offset);
  assert.ok(first.boost < film.boost);
  film = first;
  for (let i = 0; i < 180; i++) film = advanceFilm(film, 1 / 60);
  assert.ok(Math.abs(film.speed - FILM_IDLE_SPEED) < .2);
  assert.ok(film.boost < .2);
  assert.deepEqual(advanceFilm(film, 0), film);
  assert.equal(advanceFilm(film, 30).offset, advanceFilm(film, .05).offset);
});
