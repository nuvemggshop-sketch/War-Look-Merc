class ControlManager {
    constructor(domElement, onGamepadStatusChange) {
        this.domElement = domElement;
        this.onGamepadStatusChange = onGamepadStatusChange;

        this.keys = {};
        this.mouseDelta = { x: 0, y: 0 };
        this.mouseFire = false;
        this.isPointerLocked = false;

        this.gamepadIndex = null;
        this.gamepadConnected = false;
        this.gamepadName = '';

        this.initKeyboardMouse();
        this.initGamepadListeners();
    }

    initKeyboardMouse() {
        window.addEventListener('keydown', (e) => { this.keys[e.code] = true; });
        window.addEventListener('keyup', (e) => { this.keys[e.code] = false; });

        document.addEventListener('pointerlockchange', () => {
            this.isPointerLocked = (document.pointerLockElement === this.domElement);
        });

        this.domElement.addEventListener('click', () => {
            if (!this.isPointerLocked && this.domElement.requestPointerLock) {
                this.domElement.requestPointerLock();
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (this.isPointerLocked) {
                this.mouseDelta.x += e.movementX || 0;
                this.mouseDelta.y += e.movementY || 0;
            }
        });

        window.addEventListener('mousedown', (e) => {
            if (e.button === 0 && this.isPointerLocked) this.mouseFire = true;
        });

        window.addEventListener('mouseup', (e) => {
            if (e.button === 0) this.mouseFire = false;
        });
    }

    initGamepadListeners() {
        window.addEventListener('gamepadconnected', (e) => {
            this.gamepadIndex = e.gamepad.index;
            this.gamepadConnected = true;
            this.gamepadName = e.gamepad.id;
            if (this.onGamepadStatusChange) this.onGamepadStatusChange(true, this.gamepadName);
        });

        window.addEventListener('gamepaddisconnected', (e) => {
            if (this.gamepadIndex === e.gamepad.index) {
                this.gamepadIndex = null;
                this.gamepadConnected = false;
                this.gamepadName = '';
                if (this.onGamepadStatusChange) this.onGamepadStatusChange(false, '');
            }
        });
    }

    applyDeadzone(val, threshold = 0.14) {
        return Math.abs(val) < threshold ? 0 : val;
    }

    getInput() {
        const input = { forward: 0, strafe: 0, vertical: 0, yaw: 0, pitch: 0, boost: false, fire: false };

        if (this.keys['KeyW'] || this.keys['ArrowUp']) input.forward += 1;
        if (this.keys['KeyS'] || this.keys['ArrowDown']) input.forward -= 1;
        if (this.keys['KeyD'] || this.keys['ArrowRight']) input.strafe += 1;
        if (this.keys['KeyA'] || this.keys['ArrowLeft']) input.strafe -= 1;
        if (this.keys['Space']) input.vertical += 1;
        if (this.keys['ShiftLeft'] || this.keys['ShiftRight']) input.vertical -= 1;
        if (this.keys['KeyE'] || this.keys['ControlLeft']) input.boost = true;
        if (this.keys['KeyF'] || this.mouseFire) input.fire = true;

        input.yaw -= this.mouseDelta.x * 0.0024;
        input.pitch -= this.mouseDelta.y * 0.0024;
        this.mouseDelta.x = 0;
        this.mouseDelta.y = 0;

        const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
        const gp = this.gamepadIndex !== null ? gamepads[this.gamepadIndex] : gamepads[0];

        if (gp && gp.connected) {
            if (!this.gamepadConnected) {
                this.gamepadConnected = true;
                this.gamepadIndex = gp.index;
                this.gamepadName = gp.id;
                if (this.onGamepadStatusChange) this.onGamepadStatusChange(true, gp.id);
            }

            const lx = this.applyDeadzone(gp.axes[0] || 0);
            const ly = this.applyDeadzone(gp.axes[1] || 0);
            input.strafe += lx;
            input.forward -= ly;

            const rx = this.applyDeadzone(gp.axes[2] || 0);
            const ry = this.applyDeadzone(gp.axes[3] || 0);
            input.yaw -= rx * 0.048;
            input.pitch -= ry * 0.038;

            const r2 = gp.buttons[7] ? gp.buttons[7].value : 0;
            const l2 = gp.buttons[6] ? gp.buttons[6].value : 0;
            input.vertical += (r2 - l2);

            if (gp.buttons[0] && gp.buttons[0].pressed) input.boost = true; // X (Cruz)
            if (gp.buttons[2] && gp.buttons[2].pressed) input.fire = true;  // Cuadrado (R1 ignorado)
        }

        input.forward = Math.max(-1, Math.min(1, input.forward));
        input.strafe = Math.max(-1, Math.min(1, input.strafe));
        input.vertical = Math.max(-1, Math.min(1, input.vertical));

        return input;
    }

    releasePointer() {
        if (document.pointerLockElement) document.exitPointerLock();
    }
}