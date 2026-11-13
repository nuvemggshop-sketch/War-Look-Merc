import { clamp, mapGamepadToControlInput, type NormalizedControlInput } from './rules';

export class ControlManager {
  private domElement: HTMLElement;
  private onGamepadStatusChange?: (connected: boolean, name: string) => void;

  private keys = new Set<string>();
  private justPressedKeys = new Set<string>();
  private mouseDelta = { x: 0, y: 0 };
  private mouseFire = false;
  private rightMouseJustPressed = false;
  private middleMouseJustPressed = false;
  private pointerLocked = false;

  private gamepadIndex: number | null = null;
  private gamepadConnected = false;
  private gamepadName = '';
  private prevGamepadButtons: boolean[] = [];

  constructor(
    domElement: HTMLElement,
    onGamepadStatusChange?: (connected: boolean, name: string) => void
  ) {
    this.domElement = domElement;
    this.onGamepadStatusChange = onGamepadStatusChange;

    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.clearHeldInputs);
    document.addEventListener('visibilitychange', this.handleVisibilityChange);
    document.addEventListener('pointerlockchange', this.handlePointerLockChange);
    this.domElement.addEventListener('click', this.handleCanvasClick);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('mousedown', this.handleMouseDown);
    window.addEventListener('mouseup', this.handleMouseUp);
    this.domElement.addEventListener('contextmenu', this.handleContextMenu);
    window.addEventListener('gamepadconnected', this.handleGamepadConnected);
    window.addEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
  }

  private handleKeyDown = (e: KeyboardEvent): void => {
    if (!this.keys.has(e.code)) {
      this.justPressedKeys.add(e.code);
    }
    this.keys.add(e.code);
  };

  private handleKeyUp = (e: KeyboardEvent): void => {
    this.keys.delete(e.code);
  };

  private handleVisibilityChange = (): void => {
    if (document.hidden) {
      this.clearHeldInputs();
    }
  };

  clearHeldInputs = (): void => {
    this.keys.clear();
    this.justPressedKeys.clear();
    this.mouseFire = false;
    this.rightMouseJustPressed = false;
    this.middleMouseJustPressed = false;
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;
  };

  private handlePointerLockChange = (): void => {
    this.pointerLocked = document.pointerLockElement === this.domElement;
  };

  private handleCanvasClick = (): void => {
    if (
      document.body.dataset.state === 'playing' &&
      !this.pointerLocked &&
      this.domElement.requestPointerLock
    ) {
      try {
        const res = this.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      } catch {
        // Ignore in headless/non-interactive contexts
      }
    }
  };

  private handleMouseMove = (e: MouseEvent): void => {
    if (this.pointerLocked) {
      this.mouseDelta.x += e.movementX || 0;
      this.mouseDelta.y += e.movementY || 0;
    }
  };

  private handleMouseDown = (e: MouseEvent): void => {
    if (e.button === 0 && (this.pointerLocked || e.target === this.domElement)) {
      this.mouseFire = true;
    } else if (e.button === 1 && (this.pointerLocked || e.target === this.domElement)) {
      e.preventDefault();
      this.middleMouseJustPressed = true;
    } else if (e.button === 2 && (this.pointerLocked || e.target === this.domElement)) {
      this.rightMouseJustPressed = true;
    }
  };

  private handleMouseUp = (e: MouseEvent): void => {
    if (e.button === 0) this.mouseFire = false;
  };

  private handleContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private handleGamepadConnected = (e: GamepadEvent): void => {
    this.gamepadIndex = e.gamepad.index;
    this.gamepadConnected = true;
    this.gamepadName = e.gamepad.id;
    this.onGamepadStatusChange?.(true, this.gamepadName);
  };

  private handleGamepadDisconnected = (e: GamepadEvent): void => {
    if (this.gamepadIndex === e.gamepad.index) {
      this.gamepadIndex = null;
      this.gamepadConnected = false;
      this.gamepadName = '';
      this.prevGamepadButtons = [];
      this.onGamepadStatusChange?.(false, '');
    }
  };

  isPointerLocked(): boolean {
    return this.pointerLocked;
  }

  getGamepadInfo(): { connected: boolean; name: string } {
    return { connected: this.gamepadConnected, name: this.gamepadName };
  }

  consumeKeyPress(code: string): boolean {
    if (this.justPressedKeys.has(code)) {
      this.justPressedKeys.delete(code);
      return true;
    }
    return false;
  }

  getInput(): NormalizedControlInput {
    let forward = 0;
    let strafe = 0;
    let vertical = 0;
    let yaw = 0;
    let pitch = 0;
    let boost = false;
    let fire = false;

    if (this.keys.has('KeyW') || this.keys.has('ArrowUp')) forward += 1;
    if (this.keys.has('KeyS') || this.keys.has('ArrowDown')) forward -= 1;
    if (this.keys.has('KeyD') || this.keys.has('ArrowRight')) strafe += 1;
    if (this.keys.has('KeyA') || this.keys.has('ArrowLeft')) strafe -= 1;
    if (this.keys.has('Space')) vertical += 1;
    if (this.keys.has('ShiftLeft') || this.keys.has('ShiftRight')) vertical -= 1;
    if (this.keys.has('KeyE') || this.keys.has('ControlLeft')) boost = true;
    if (this.keys.has('KeyF') || this.mouseFire) fire = true;

    // Keyboard fine-aim backup (Q/Z or I/J/K/L not needed, mouse handles look; add Q/E gentle yaw? E is boost)
    yaw -= this.mouseDelta.x * 0.0024;
    pitch -= this.mouseDelta.y * 0.0024;
    this.mouseDelta.x = 0;
    this.mouseDelta.y = 0;

    let toggleOpticsPressed =
      this.consumeKeyPress('KeyV') || this.rightMouseJustPressed;
    this.rightMouseJustPressed = false;
    let rocketPressed =
      this.consumeKeyPress('KeyQ') || this.middleMouseJustPressed;
    this.middleMouseJustPressed = false;
    let toggleModePressed = this.consumeKeyPress('KeyC');
    let deployPressed =
      this.consumeKeyPress('Space') ||
      this.consumeKeyPress('Enter') ||
      this.consumeKeyPress('KeyF');

    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    const gp =
      (this.gamepadIndex !== null ? gamepads[this.gamepadIndex] : null) ??
      Array.from(gamepads).find((g) => g && g.connected) ??
      null;

    if (gp && gp.connected) {
      if (!this.gamepadConnected) {
        this.gamepadConnected = true;
        this.gamepadIndex = gp.index;
        this.gamepadName = gp.id;
        this.onGamepadStatusChange?.(true, gp.id);
      }

      // Strictly ignores R1 (buttons[5]) — uses Square (buttons[2]) for Fire, Triangle for Rocket!
      const mapped = mapGamepadToControlInput(gp, this.prevGamepadButtons);
      this.prevGamepadButtons = mapped.currentButtons;

      forward += mapped.forward;
      strafe += mapped.strafe;
      vertical += mapped.vertical;
      yaw += mapped.yaw;
      pitch += mapped.pitch;
      boost = boost || mapped.boost;
      fire = fire || mapped.fire;
      rocketPressed = rocketPressed || mapped.rocketPressed;
      toggleOpticsPressed = toggleOpticsPressed || mapped.toggleOpticsPressed;
      toggleModePressed = toggleModePressed || mapped.toggleModePressed;
      deployPressed = deployPressed || mapped.deployPressed;
    }

    return {
      forward: clamp(forward, -1, 1),
      strafe: clamp(strafe, -1, 1),
      vertical: clamp(vertical, -1, 1),
      yaw,
      pitch,
      boost,
      fire,
      rocketPressed,
      toggleOpticsPressed,
      toggleModePressed,
      deployPressed,
    };
  }

  requestPointerLock(): void {
    if (!this.pointerLocked && this.domElement.requestPointerLock) {
      try {
        const res = this.domElement.requestPointerLock() as unknown as Promise<void> | undefined;
        if (res && typeof res.catch === 'function') {
          res.catch(() => {});
        }
      } catch {
        // Safe no-op
      }
    }
  }

  releasePointer(): void {
    if (document.pointerLockElement) {
      document.exitPointerLock?.();
    }
  }

  dispose(): void {
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.clearHeldInputs);
    document.removeEventListener('visibilitychange', this.handleVisibilityChange);
    document.removeEventListener('pointerlockchange', this.handlePointerLockChange);
    this.domElement.removeEventListener('click', this.handleCanvasClick);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('mousedown', this.handleMouseDown);
    window.removeEventListener('mouseup', this.handleMouseUp);
    this.domElement.removeEventListener('contextmenu', this.handleContextMenu);
    window.removeEventListener('gamepadconnected', this.handleGamepadConnected);
    window.removeEventListener('gamepaddisconnected', this.handleGamepadDisconnected);
  }
}
