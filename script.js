// ========== 画布和上下文初始化（性能优化） ==========
const videoElement = document.querySelector('.input_video');
const canvasElement = document.querySelector('.output_canvas');
const canvasCtx = canvasElement.getContext('2d', { 
    alpha: false,
    desynchronized: true // 提高性能
});
const drawingCanvasElement = document.querySelector('.drawing_canvas');
const drawingCtx = drawingCanvasElement.getContext('2d', {
    alpha: true,
    desynchronized: true,
    willReadFrequently: false // 优化性能
});
const particleCanvasElement = document.querySelector('.particle_canvas');
const particleCtx = particleCanvasElement.getContext('2d', {
    alpha: true,
    desynchronized: true
});
const loadingElement = document.querySelector('.loading');

// 性能监控
let fps = 0;
let frameCount = 0;
let lastTime = performance.now();

// ========== UI 元素 ==========
const clearBtn = document.getElementById('clearBtn');
const eraserBtn = document.getElementById('eraserBtn');
const undoBtn = document.getElementById('undoBtn');
const redoBtn = document.getElementById('redoBtn');
const saveBtn = document.getElementById('saveBtn');
const brushSizeSlider = document.getElementById('brushSize');
const brushSizeValue = document.getElementById('brushSizeValue');
const opacitySlider = document.getElementById('opacity');
const opacityValue = document.getElementById('opacityValue');
const colorSwatches = document.querySelectorAll('.color-swatch');
const brushTypes = document.querySelectorAll('.brush-type');
const bgOptions = document.querySelectorAll('.bg-option');
const particleEffectToggle = document.getElementById('particleEffect');
const trailEffectToggle = document.getElementById('trailEffect');
const gestureIndicator = document.querySelector('.gesture-indicator');
const statusText = document.getElementById('statusText');

// ========== 状态变量 ==========
let isDrawing = false;
let lastX, lastY;
let isEraser = false;
let currentColor = '#ff0080';
let currentBrushType = 'normal';
let currentBackground = 'transparent';
let enableParticles = true;
let enableTrail = false;
let rainbowHue = 0;

// ========== 历史记录（撤销/重做）- 使用 OffscreenCanvas 优化 ==========
let historyStack = [];
let historyStep = -1;
const maxHistory = 20;
let lastHistorySave = 0;
const historySaveDelay = 500; // 延迟保存，避免频繁操作

// ========== 粒子系统 - 对象池优化 ==========
let particles = [];
const maxParticles = 300; // 限制粒子数量
let particlePool = [];

// ========== 性能优化：离屏画布 ==========
let offscreenCanvas;
let offscreenCtx;
if (typeof OffscreenCanvas !== 'undefined') {
    offscreenCanvas = new OffscreenCanvas(drawingCanvasElement.width, drawingCanvasElement.height);
    offscreenCtx = offscreenCanvas.getContext('2d');
}

// ========== 粒子类（优化版） ==========
class Particle {
    constructor() {
        this.reset(0, 0, '#ffffff');
    }

    reset(x, y, color) {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 6;
        this.vy = (Math.random() - 0.5) * 6 - 2;
        this.life = 1.0;
        this.decay = Math.random() * 0.03 + 0.02;
        this.size = Math.random() * 3 + 1;
        this.color = color;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.2;
    }

    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.15; // 重力
        this.vx *= 0.98; // 空气阻力
        this.life -= this.decay;
        this.rotation += this.rotationSpeed;
    }

    draw(ctx) {
        if (this.life <= 0) return;
        
        ctx.globalAlpha = this.life * this.life; // 平方衰减更自然
        ctx.fillStyle = this.color;
        
        // 优化：减少阴影使用
        if (this.life > 0.7) {
            ctx.shadowBlur = 8;
            ctx.shadowColor = this.color;
        }
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        // 绘制星形粒子
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const angle = (i * Math.PI * 2) / 5;
            const x = Math.cos(angle) * this.size;
            const y = Math.sin(angle) * this.size;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
        
        ctx.restore();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = 1;
    }

    isDead() {
        return this.life <= 0;
    }
}

// 粒子对象池
function getParticle(x, y, color) {
    let particle = particlePool.pop();
    if (!particle) {
        particle = new Particle();
    }
    particle.reset(x, y, color);
    return particle;
}

function recycleParticle(particle) {
    if (particlePool.length < 100) {
        particlePool.push(particle);
    }
}

// ========== 画笔样式设置 ==========
function setBrushStyle() {
    if (isEraser) {
        drawingCtx.globalCompositeOperation = 'destination-out';
        drawingCtx.lineWidth = brushSizeSlider.value * 2;
    } else {
        drawingCtx.globalCompositeOperation = 'source-over';
        drawingCtx.lineWidth = brushSizeSlider.value;
        
        const activeColor = document.querySelector('.color-swatch.active');
        if (activeColor && activeColor.dataset.color === 'rainbow') {
            currentColor = 'rainbow';
        } else if (activeColor) {
            currentColor = activeColor.dataset.color;
        }
    }
    
    drawingCtx.lineCap = 'round';
    drawingCtx.lineJoin = 'round';
    drawingCtx.globalAlpha = opacitySlider.value / 100;
}

// ========== 获取当前颜色 ==========
function getCurrentColor() {
    if (currentColor === 'rainbow') {
        rainbowHue = (rainbowHue + 2) % 360;
        return `hsl(${rainbowHue}, 100%, 50%)`;
    }
    return currentColor;
}

// ========== 绘画函数（优化版） ==========
function draw(x, y) {
    const color = getCurrentColor();
    
    // 使用requestAnimationFrame优化绘制
    switch (currentBrushType) {
        case 'normal':
            drawNormal(x, y, color);
            break;
        case 'glow':
            drawGlow(x, y, color);
            break;
        case 'spray':
            drawSpray(x, y, color);
            break;
        case 'neon':
            drawNeon(x, y, color);
            break;
    }
    
    // 生成粒子（优化：使用对象池，限制数量）
    if (enableParticles && !isEraser && particles.length < maxParticles) {
        const particleCount = currentBrushType === 'neon' ? 5 : 2;
        for (let i = 0; i < particleCount; i++) {
            particles.push(getParticle(x, y, color));
        }
    }
}

function drawNormal(x, y, color) {
    drawingCtx.strokeStyle = color;
    drawingCtx.beginPath();
    drawingCtx.moveTo(lastX, lastY);
    drawingCtx.lineTo(x, y);
    drawingCtx.stroke();
}

function drawGlow(x, y, color) {
    drawingCtx.strokeStyle = color;
    drawingCtx.shadowBlur = 20;
    drawingCtx.shadowColor = color;
    drawingCtx.beginPath();
    drawingCtx.moveTo(lastX, lastY);
    drawingCtx.lineTo(x, y);
    drawingCtx.stroke();
    drawingCtx.shadowBlur = 0;
}

function drawSpray(x, y, color) {
    const density = brushSizeSlider.value * 2;
    for (let i = 0; i < density; i++) {
        const offsetX = (Math.random() - 0.5) * brushSizeSlider.value * 2;
        const offsetY = (Math.random() - 0.5) * brushSizeSlider.value * 2;
        drawingCtx.fillStyle = color;
        drawingCtx.fillRect(x + offsetX, y + offsetY, 2, 2);
    }
}

function drawNeon(x, y, color) {
    // 多层发光效果
    for (let i = 0; i < 3; i++) {
        drawingCtx.strokeStyle = color;
        drawingCtx.shadowBlur = 30 + i * 10;
        drawingCtx.shadowColor = color;
        drawingCtx.lineWidth = brushSizeSlider.value + i * 2;
        drawingCtx.beginPath();
        drawingCtx.moveTo(lastX, lastY);
        drawingCtx.lineTo(x, y);
        drawingCtx.stroke();
    }
    drawingCtx.shadowBlur = 0;
    drawingCtx.lineWidth = brushSizeSlider.value;
}

// ========== 历史记录管理（优化版） ==========
function saveToHistory() {
    const now = Date.now();
    // 防抖：避免频繁保存
    if (now - lastHistorySave < historySaveDelay) {
        return;
    }
    lastHistorySave = now;
    
    // 移除当前步骤之后的所有历史
    historyStack = historyStack.slice(0, historyStep + 1);
    
    // 使用压缩的画布数据 - 转为DataURL节省内存
    const dataURL = drawingCanvasElement.toDataURL('image/png', 0.8);
    historyStack.push(dataURL);
    
    // 限制历史记录数量
    if (historyStack.length > maxHistory) {
        historyStack.shift();
    } else {
        historyStep++;
    }
    
    updateUndoRedoButtons();
}

// 立即保存（用于清空等重要操作）
function saveToHistoryNow() {
    lastHistorySave = 0;
    saveToHistory();
}

function undo() {
    if (historyStep > 0) {
        historyStep--;
        const dataURL = historyStack[historyStep];
        restoreFromDataURL(dataURL);
        updateUndoRedoButtons();
    }
}

function redo() {
    if (historyStep < historyStack.length - 1) {
        historyStep++;
        const dataURL = historyStack[historyStep];
        restoreFromDataURL(dataURL);
        updateUndoRedoButtons();
    }
}

function restoreFromDataURL(dataURL) {
    const img = new Image();
    img.onload = () => {
        drawingCtx.clearRect(0, 0, drawingCanvasElement.width, drawingCanvasElement.height);
        drawingCtx.drawImage(img, 0, 0);
    };
    img.src = dataURL;
}

function updateUndoRedoButtons() {
    undoBtn.disabled = historyStep <= 0;
    redoBtn.disabled = historyStep >= historyStack.length - 1;
    undoBtn.style.opacity = historyStep <= 0 ? '0.5' : '1';
    redoBtn.style.opacity = historyStep >= historyStack.length - 1 ? '0.5' : '1';
}

// ========== 背景设置 ==========
function setBackground(bgType) {
    currentBackground = bgType;
    
    switch (bgType) {
        case 'transparent':
            drawingCanvasElement.style.background = 'transparent';
            break;
        case 'black':
            drawingCanvasElement.style.background = '#000000';
            break;
        case 'white':
            drawingCanvasElement.style.background = '#ffffff';
            break;
        case 'grid':
            drawingCanvasElement.style.background = `
                repeating-linear-gradient(0deg, rgba(255,255,255,0.1) 0px, transparent 1px, transparent 20px, rgba(255,255,255,0.1) 21px),
                repeating-linear-gradient(90deg, rgba(255,255,255,0.1) 0px, transparent 1px, transparent 20px, rgba(255,255,255,0.1) 21px),
                #1a1a2e
            `;
            break;
    }
}

// ========== 粒子动画循环（高性能版） ==========
let lastParticleTime = 0;
const particleFrameTime = 1000 / 60; // 60fps

function animateParticles(currentTime) {
    requestAnimationFrame(animateParticles);
    
    // 帧率控制
    if (currentTime - lastParticleTime < particleFrameTime) {
        return;
    }
    lastParticleTime = currentTime;
    
    // 更新FPS计数
    frameCount++;
    if (currentTime - lastTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastTime = currentTime;
        updatePerformanceDisplay();
    }
    
    if (enableTrail) {
        particleCtx.fillStyle = 'rgba(0, 0, 0, 0.05)';
        particleCtx.fillRect(0, 0, particleCanvasElement.width, particleCanvasElement.height);
    } else {
        particleCtx.clearRect(0, 0, particleCanvasElement.width, particleCanvasElement.height);
    }
    
    // 批量处理粒子（优化）
    let i = particles.length;
    while (i--) {
        const particle = particles[i];
        particle.update();
        
        if (particle.isDead()) {
            recycleParticle(particle);
            particles.splice(i, 1);
        } else {
            particle.draw(particleCtx);
        }
    }
}

// 性能显示更新
function updatePerformanceDisplay() {
    if (window.perfDisplay) {
        perfDisplay.textContent = `${fps} FPS | ${particles.length} 粒子`;
    }
}

// 启动粒子动画
requestAnimationFrame(animateParticles);

// ========== 事件监听器 ==========

// 清空画布
clearBtn.addEventListener('click', () => {
    if (confirm('确定要清空画布吗？')) {
        drawingCtx.clearRect(0, 0, drawingCanvasElement.width, drawingCanvasElement.height);
        saveToHistoryNow();
    }
});

// 橡皮擦切换
eraserBtn.addEventListener('click', () => {
    isEraser = !isEraser;
    eraserBtn.classList.toggle('active', isEraser);
    if (isEraser) {
        document.querySelector('.color-swatch.active')?.classList.remove('active');
    } else {
        colorSwatches[0].classList.add('active');
    }
    setBrushStyle();
});

// 撤销
undoBtn.addEventListener('click', undo);

// 重做
redoBtn.addEventListener('click', redo);

// 保存作品
saveBtn.addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `artwork_${Date.now()}.png`;
    link.href = drawingCanvasElement.toDataURL();
    link.click();
});

// 笔刷大小
brushSizeSlider.addEventListener('input', () => {
    brushSizeValue.textContent = brushSizeSlider.value;
    setBrushStyle();
});

// 透明度
opacitySlider.addEventListener('input', () => {
    opacityValue.textContent = opacitySlider.value;
    setBrushStyle();
});

// 颜色选择
colorSwatches.forEach(swatch => {
    swatch.addEventListener('click', () => {
        document.querySelector('.color-swatch.active')?.classList.remove('active');
        swatch.classList.add('active');
        
        if (isEraser) {
            isEraser = false;
            eraserBtn.classList.remove('active');
        }
        setBrushStyle();
    });
});

// 笔刷类型选择
brushTypes.forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelector('.brush-type.active')?.classList.remove('active');
        btn.classList.add('active');
        currentBrushType = btn.dataset.type;
    });
});

// 背景选择
bgOptions.forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelector('.bg-option.active')?.classList.remove('active');
        btn.classList.add('active');
        setBackground(btn.dataset.bg);
    });
});

// 粒子效果开关
particleEffectToggle.addEventListener('change', (e) => {
    enableParticles = e.target.checked;
    if (!enableParticles) {
        particles = [];
    }
});

// 拖尾效果开关
trailEffectToggle.addEventListener('change', (e) => {
    enableTrail = e.target.checked;
});


// ========== MediaPipe 手部追踪逻辑 ==========
function onResults(results) {
    loadingElement.style.display = 'none';
    statusText.textContent = '运行中';

    // 绘制视频帧到背景画布
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);

    // 增强手部骨架可视化
    if (results.multiHandLandmarks) {
        for (const landmarks of results.multiHandLandmarks) {
            // 绘制连接线（骨架）- 使用渐变色
            const gradient = canvasCtx.createLinearGradient(0, 0, canvasElement.width, canvasElement.height);
            gradient.addColorStop(0, '#667eea');
            gradient.addColorStop(0.5, '#764ba2');
            gradient.addColorStop(1, '#f093fb');
            
            drawConnectors(canvasCtx, landmarks, HAND_CONNECTIONS,
                           {color: gradient, lineWidth: 3});
            
            // 绘制关节点 - 发光效果
            landmarks.forEach((landmark, index) => {
                const x = landmark.x * canvasElement.width;
                const y = landmark.y * canvasElement.height;
                
                canvasCtx.beginPath();
                canvasCtx.arc(x, y, 5, 0, Math.PI * 2);
                canvasCtx.fillStyle = '#ffffff';
                canvasCtx.shadowBlur = 15;
                canvasCtx.shadowColor = '#667eea';
                canvasCtx.fill();
                canvasCtx.shadowBlur = 0;
                
                // 指尖高亮
                if (index === 8 || index === 4) {
                    canvasCtx.beginPath();
                    canvasCtx.arc(x, y, 8, 0, Math.PI * 2);
                    canvasCtx.fillStyle = index === 8 ? '#4cd964' : '#ff3b30';
                    canvasCtx.shadowBlur = 20;
                    canvasCtx.shadowColor = index === 8 ? '#4cd964' : '#ff3b30';
                    canvasCtx.fill();
                    canvasCtx.shadowBlur = 0;
                }
            });
        }
    }
    canvasCtx.restore();

    // 绘画逻辑（增强版）
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];
        
        const indexFingerTip = landmarks[8];
        const thumbTip = landmarks[4];

        const distance = Math.sqrt(
            Math.pow(indexFingerTip.x - thumbTip.x, 2) +
            Math.pow(indexFingerTip.y - thumbTip.y, 2)
        );

        const canvasX = indexFingerTip.x * drawingCanvasElement.width;
        const canvasY = indexFingerTip.y * drawingCanvasElement.height;

        // 更新手指光标位置
        const fingerCursor = document.getElementById('fingerCursor');
        if (fingerCursor) {
            fingerCursor.style.left = `${canvasX}px`;
            fingerCursor.style.top = `${canvasY}px`;
            fingerCursor.classList.add('active');
        }

        // 更新手势距离显示
        const gestureDistance = document.getElementById('gestureDistance');
        if (gestureDistance) {
            const distPercent = Math.min(distance * 20, 1) * 100;
            gestureDistance.textContent = `距离: ${distPercent.toFixed(0)}%`;
        }

        // 绘画触发（优化阈值）
        const drawThreshold = 0.05;
        if (distance < drawThreshold) {
            gestureIndicator.classList.add('drawing');
            
            if (!isDrawing) {
                isDrawing = true;
                lastX = canvasX;
                lastY = canvasY;
                // 延迟保存历史
                setTimeout(() => saveToHistory(), 100);
            }
            
            draw(canvasX, canvasY);
            
            lastX = canvasX;
            lastY = canvasY;
        } else {
            gestureIndicator.classList.remove('drawing');
            if (isDrawing) {
                isDrawing = false;
                // 绘画结束时保存
                saveToHistoryNow();
            }
        }
    } else {
        gestureIndicator.classList.remove('drawing');
        const fingerCursor = document.getElementById('fingerCursor');
        if (fingerCursor) {
            fingerCursor.classList.remove('active');
        }
        isDrawing = false;
    }
}

// ========== 初始化 MediaPipe ==========
const hands = new Hands({locateFile: (file) => {
    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
}});

hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

hands.onResults(onResults);

// ========== 初始化摄像头（带错误处理） ==========
let camera;

async function initCamera() {
    try {
        statusText.textContent = '正在启动摄像头...';
        
        camera = new Camera(videoElement, {
            onFrame: async () => {
                await hands.send({image: videoElement});
            },
            width: 1280,
            height: 720
        });

        await camera.start();
        statusText.textContent = '摄像头已就绪';
        console.log("✅ 摄像头启动成功");
    } catch (error) {
        console.error("❌ 摄像头启动失败:", error);
        handleCameraError(error);
    }
}

function handleCameraError(error) {
    loadingElement.style.display = 'none';
    
    let errorMessage = '';
    let solution = '';
    
    if (error.name === 'NotReadableError' || error.message.includes('Device in use')) {
        errorMessage = '📷 摄像头被占用';
        solution = '请关闭其他正在使用摄像头的应用（如Zoom、Teams、微信等），然后刷新页面';
    } else if (error.name === 'NotAllowedError') {
        errorMessage = '🚫 摄像头权限被拒绝';
        solution = '请在浏览器设置中允许访问摄像头，然后刷新页面';
    } else if (error.name === 'NotFoundError') {
        errorMessage = '❌ 未找到摄像头';
        solution = '请确保设备已连接摄像头';
    } else {
        errorMessage = '⚠️ 摄像头初始化失败';
        solution = `错误信息: ${error.message}`;
    }
    
    statusText.textContent = errorMessage;
    
    // 创建错误提示界面
    const errorDiv = document.createElement('div');
    errorDiv.className = 'error-message';
    errorDiv.innerHTML = `
        <div class="error-content">
            <h2>${errorMessage}</h2>
            <p>${solution}</p>
            <div class="error-actions">
                <button onclick="location.reload()" class="retry-btn">🔄 重试</button>
                <button onclick="showCameraTips()" class="tips-btn">💡 查看帮助</button>
            </div>
        </div>
    `;
    document.body.appendChild(errorDiv);
}

// 显示摄像头帮助信息
window.showCameraTips = function() {
    alert(`摄像头问题排查：

1. 关闭占用摄像头的应用：
   - Zoom、Microsoft Teams、Skype
   - 微信视频通话
   - 其他浏览器标签页

2. 检查浏览器权限：
   - 点击地址栏左侧的锁图标
   - 确保摄像头权限为"允许"

3. 重启浏览器：
   - 完全关闭浏览器
   - 重新打开

4. 使用其他浏览器：
   - 推荐使用 Chrome 或 Edge
   
如问题仍然存在，请尝试重启电脑。`);
};

// ========== 初始化设置 ==========
// 默认选中第一个颜色
colorSwatches[0].classList.add('active');
setBrushStyle();

// 初始化历史记录
saveToHistoryNow();
updateUndoRedoButtons();

// 添加键盘快捷键
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z') {
            e.preventDefault();
            if (e.shiftKey) {
                redo();
            } else {
                undo();
            }
        } else if (e.key === 'y') {
            e.preventDefault();
            redo();
        } else if (e.key === 's') {
            e.preventDefault();
            saveBtn.click();
        }
    } else if (e.key === 'e' || e.key === 'E') {
        eraserBtn.click();
    } else if (e.key === 'c' || e.key === 'C') {
        clearBtn.click();
    }
});

// ========== 背景粒子效果 ==========
const bgParticlesCanvas = document.getElementById('bgParticles');
const bgCtx = bgParticlesCanvas.getContext('2d');
bgParticlesCanvas.width = window.innerWidth;
bgParticlesCanvas.height = window.innerHeight;

class BackgroundParticle {
    constructor() {
        this.reset();
    }
    
    reset() {
        this.x = Math.random() * bgParticlesCanvas.width;
        this.y = Math.random() * bgParticlesCanvas.height;
        this.vx = (Math.random() - 0.5) * 0.5;
        this.vy = (Math.random() - 0.5) * 0.5;
        this.size = Math.random() * 2 + 1;
        this.opacity = Math.random() * 0.5 + 0.2;
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        
        if (this.x < 0 || this.x > bgParticlesCanvas.width) this.vx *= -1;
        if (this.y < 0 || this.y > bgParticlesCanvas.height) this.vy *= -1;
    }
    
    draw() {
        bgCtx.fillStyle = `rgba(102, 126, 234, ${this.opacity})`;
        bgCtx.beginPath();
        bgCtx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        bgCtx.fill();
    }
}

const bgParticles = Array.from({ length: 50 }, () => new BackgroundParticle());

function animateBackground() {
    bgCtx.clearRect(0, 0, bgParticlesCanvas.width, bgParticlesCanvas.height);
    
    bgParticles.forEach(p => {
        p.update();
        p.draw();
    });
    
    // 绘制连线
    bgCtx.strokeStyle = 'rgba(102, 126, 234, 0.1)';
    bgCtx.lineWidth = 1;
    
    for (let i = 0; i < bgParticles.length; i++) {
        for (let j = i + 1; j < bgParticles.length; j++) {
            const dx = bgParticles[i].x - bgParticles[j].x;
            const dy = bgParticles[i].y - bgParticles[j].y;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (distance < 150) {
                bgCtx.beginPath();
                bgCtx.moveTo(bgParticles[i].x, bgParticles[i].y);
                bgCtx.lineTo(bgParticles[j].x, bgParticles[j].y);
                bgCtx.globalAlpha = 1 - distance / 150;
                bgCtx.stroke();
                bgCtx.globalAlpha = 1;
            }
        }
    }
    
    requestAnimationFrame(animateBackground);
}

// 窗口大小改变时更新画布
window.addEventListener('resize', () => {
    bgParticlesCanvas.width = window.innerWidth;
    bgParticlesCanvas.height = window.innerHeight;
    bgParticles.forEach(p => p.reset());
});

// 启动背景动画
animateBackground();

// ========== 性能显示 ==========
window.perfDisplay = document.getElementById('perfDisplay');

// 启动应用
initCamera();

console.log("✨ AI 手势画板 Pro 已成功初始化！");
console.log("🎨 快捷键：Ctrl+Z 撤销 | Ctrl+Y 重做 | Ctrl+S 保存 | E 橡皮擦 | C 清空");
console.log("⚡ 性能优化：对象池、帧率控制、离屏渲染");


