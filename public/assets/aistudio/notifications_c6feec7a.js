class NotificationManager {
    constructor(soundManager) {
        this.sound = soundManager;
        this.killBanner = document.getElementById('kill-banner');
        this.kbText = document.getElementById('kb-text');
        this.killfeedList = document.getElementById('killfeed-list');

        this.staticScreen = document.getElementById('static-screen');
        this.radioBox = document.getElementById('radio-transmission');
        this.radioText = document.getElementById('radio-text');

        this.bannerTimeout = null;
        this.radioTimeout = null;
    }

    notifyKill(title, points) {
        this.sound.playKillConfirm();

        this.kbText.textContent = `+${points} PTS // ${title}`;
        this.killBanner.classList.remove('hidden');

        clearTimeout(this.bannerTimeout);
        this.bannerTimeout = setTimeout(() => {
            this.killBanner.classList.add('hidden');
        }, 2500);

        const item = document.createElement('div');
        item.className = 'kf-item';
        item.textContent = `[BAJA CONFIRMADA] ${title} (+${points})`;
        this.killfeedList.prepend(item);

        if (this.killfeedList.children.length > 5) {
            this.killfeedList.removeChild(this.killfeedList.lastChild);
        }

        setTimeout(() => {
            if (item.parentNode) item.parentNode.removeChild(item);
        }, 5500);
    }

    notifyAllyKill(allyName, enemyRole, verb = 'ABATIDO') {
        const item = document.createElement('div');
        item.className = 'kf-item ally';
        item.textContent = `[ALIADO] ${allyName} // ${enemyRole} ${verb} (+80)`;
        this.killfeedList.prepend(item);

        if (this.killfeedList.children.length > 5) {
            this.killfeedList.removeChild(this.killfeedList.lastChild);
        }

        setTimeout(() => {
            if (item.parentNode) item.parentNode.removeChild(item);
        }, 5500);
    }

    notifyAllyStatus(allyName, text) {
        const item = document.createElement('div');
        item.className = 'kf-item ally status';
        item.textContent = `[${allyName}] ${text}`;
        this.killfeedList.prepend(item);

        if (this.killfeedList.children.length > 5) {
            this.killfeedList.removeChild(this.killfeedList.lastChild);
        }

        setTimeout(() => {
            if (item.parentNode) item.parentNode.removeChild(item);
        }, 4200);
    }

    showRadioMessage(message, duration = 5000) {
        this.radioText.textContent = `"${message}"`;
        this.radioBox.classList.remove('hidden');

        clearTimeout(this.radioTimeout);
        this.radioTimeout = setTimeout(() => {
            this.radioBox.classList.add('hidden');
        }, duration);
    }

    showStatic() {
        this.staticScreen.classList.remove('hidden');
    }

    hideStatic() {
        this.staticScreen.classList.add('hidden');
    }

    clear() {
        this.killBanner.classList.add('hidden');
        this.killfeedList.innerHTML = '';
        this.radioBox.classList.add('hidden');
        this.hideStatic();
    }
}