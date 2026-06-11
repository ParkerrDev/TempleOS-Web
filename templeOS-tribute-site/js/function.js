/* DRAGGABLE POPUP */
class DragHandler {
    constructor(elementId) {
        this.element = document.getElementById(elementId);
        if (!this.element) return;
        
        this.pos = { x1: 0, y1: 0, x2: 0, y2: 0 };
        this.isDragging = false;
        
        this.onMouseDown = this.onMouseDown.bind(this);
        this.onMouseMove = this.onMouseMove.bind(this);
        this.onMouseUp = this.onMouseUp.bind(this);
        
        this.element.addEventListener('mousedown', this.onMouseDown);
    }
    
    onMouseDown(e) {
        e.preventDefault();
        this.isDragging = true;
        this.pos.x2 = e.clientX;
        this.pos.y2 = e.clientY;
        
        document.addEventListener('mousemove', this.onMouseMove);
        document.addEventListener('mouseup', this.onMouseUp);
    }
    
    onMouseMove(e) {
        if (!this.isDragging) return;
        
        e.preventDefault();
        this.pos.x1 = this.pos.x2 - e.clientX;
        this.pos.y1 = this.pos.y2 - e.clientY;
        this.pos.x2 = e.clientX;
        this.pos.y2 = e.clientY;
        
        // Calculate new position
        let newTop = this.element.offsetTop - this.pos.y1;
        let newLeft = this.element.offsetLeft - this.pos.x1;
        
        // Set the element's new position (no constraints)
        this.element.style.top = newTop + "px";
        this.element.style.left = newLeft + "px";
    }
    
    onMouseUp() {
        this.isDragging = false;
        document.removeEventListener('mousemove', this.onMouseMove);
        document.removeEventListener('mouseup', this.onMouseUp);
    }
}

// Initialize drag functionality
const popupElement = document.getElementById("popup");
if (popupElement) {
    new DragHandler("popup");
}

/* DIGITAL CLOCK */
class DigitalClock {
    constructor() {
        // Cache DOM elements
        this.elements = {
            today: document.getElementById('today-js'),
            month: document.getElementById('month-js'),
            time: document.getElementById('time-js'),
            date: document.getElementById('date-js'),
        };
        
        // Check if all elements exist
        if (!Object.values(this.elements).every(el => el)) {
            console.warn('Some clock elements not found');
            return;
        }
        
        this.dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
        this.monthNames = ['01', '02', '03', '04', '05', '06', '07', '08', '09', '10', '11', '12'];
        
        this.update();
        this.intervalId = setInterval(() => this.update(), 1000);
    }
    
    update() {
        const now = new Date();
        
        // Format time components
        const hours = this.padZero(now.getHours());
        const minutes = this.padZero(now.getMinutes());
        const seconds = this.padZero(now.getSeconds());
        const date = this.padZero(now.getDate());
        
        // Update DOM elements
        this.elements.time.textContent = `${hours}:${minutes}:${seconds}`;
        this.elements.today.textContent = this.dayNames[now.getDay()];
        this.elements.date.textContent = date;
        this.elements.month.textContent = this.monthNames[now.getMonth()] + '/';
    }
    
    padZero(num) {
        return num < 10 ? '0' + num : num.toString();
    }
    
    destroy() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
        }
    }
}

// Initialize clock
const clock = new DigitalClock();

/* FPS COUNTER */
class FPSCounter {
    constructor(elementId) {
        this.element = document.getElementById(elementId);
        if (!this.element) {
            console.warn('FPS counter element not found');
            return;
        }
        
        this.times = [];
        this.isRunning = true;
        this.lastUpdateTime = 0;
        this.updateInterval = 100; // Update display every 100ms
        
        this.rafId = requestAnimationFrame(() => this.update());
    }
    
    update() {
        if (!this.isRunning) return;
        
        const now = performance.now();
        
        // Remove old timestamps (older than 1 second)
        while (this.times.length > 0 && this.times[0] <= now - 1000) {
            this.times.shift();
        }
        
        this.times.push(now);
        
        // Only update DOM every updateInterval ms to reduce overhead
        if (now - this.lastUpdateTime >= this.updateInterval) {
            this.element.textContent = `FPS: ${this.times.length}`;
            this.lastUpdateTime = now;
        }
        
        this.rafId = requestAnimationFrame(() => this.update());
    }
    
    stop() {
        this.isRunning = false;
        if (this.rafId) {
            cancelAnimationFrame(this.rafId);
        }
    }
}

// Initialize FPS counter
const fpsCounter = new FPSCounter('fps-counter');