// ========== 初始化变量 ==========
const videoElement = document.querySelector('.input_video');
const canvasElement = document.querySelector('.output_canvas');
const canvasCtx = canvasElement.getContext('2d', { alpha: false });
const particleCanvas = document.getElementById('particleCanvas');
const particleCtx = particleCanvas.getContext('2d', { alpha: true });
const loadingScreen = document.getElementById('loadingScreen');

// 数据追踪
let frameCount = 0;
let fps = 0;
let lastTime = performance.now();
let startTime = Date.now();
let detectionCount = 0;
let lastLeftPosition = null;
let lastRightPosition = null;
let velocityHistory = [];
let heatmapData = [];

// 粒子系统
let particles = [];

// ========== 矩阵雨效果 ==========
const matrixCanvas = document.getElementById('matrixCanvas');
const matrixCtx = matrixCanvas.getContext('2d');
matrixCanvas.width = window.innerWidth;
matrixCanvas.height = window.innerHeight;

const matrixChars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
const fontSize = 14;
const columns = Math.floor(matrixCanvas.width / fontSize);
const drops = Array(columns).fill(1);

function drawMatrix() {
    matrixCtx.fillStyle = 'rgba(0, 0, 0, 0.05)';
    matrixCtx.fillRect(0, 0, matrixCanvas.width, matrixCanvas.height);
    
    matrixCtx.fillStyle = '#00ff00';
    matrixCtx.font = `${fontSize}px monospace`;
    
    for (let i = 0; i < drops.length; i++) {
        const char = matrixChars[Math.floor(Math.random() * matrixChars.length)];
        const x = i * fontSize;
        const y = drops[i] * fontSize;
        
        matrixCtx.fillText(char, x, y);
        
        if (y > matrixCanvas.height && Math.random() > 0.975) {
            drops[i] = 0;
        }
        drops[i]++;
    }
}

setInterval(drawMatrix, 50);

// ========== 粒子类 ==========
class Particle {
    constructor(x, y, color = '#00ffff') {
        this.x = x;
        this.y = y;
        this.vx = (Math.random() - 0.5) * 4;
        this.vy = (Math.random() - 0.5) * 4 - 2;
        this.life = 1.0;
        this.decay = Math.random() * 0.02 + 0.01;
        this.size = Math.random() * 3 + 1;
        this.color = color;
        this.rotation = Math.random() * Math.PI * 2;
        this.rotationSpeed = (Math.random() - 0.5) * 0.1;
    }
    
    update() {
        this.x += this.vx;
        this.y += this.vy;
        this.vy += 0.1; // 重力
        this.vx *= 0.99;
        this.life -= this.decay;
        this.rotation += this.rotationSpeed;
    }
    
    draw(ctx) {
        if (this.life <= 0) return;
        
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.shadowBlur = 10;
        ctx.shadowColor = this.color;
        
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.rotate(this.rotation);
        
        // 绘制星形
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const angle = (i * Math.PI * 2) / 5;
            const radius = i % 2 === 0 ? this.size : this.size / 2;
            const x = Math.cos(angle) * radius;
            const y = Math.sin(angle) * radius;
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

// ========== 粒子动画循环 ==========
function animateParticles() {
    particleCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
    
    let i = particles.length;
    while (i--) {
        const particle = particles[i];
        particle.update();
        
        if (particle.isDead()) {
            particles.splice(i, 1);
        } else {
            particle.draw(particleCtx);
        }
    }
    
    document.getElementById('particles').textContent = particles.length;
    
    requestAnimationFrame(animateParticles);
}

animateParticles();

// ========== 热力图 ==========
const heatmapCanvas = document.getElementById('heatmapCanvas');
const heatmapCtx = heatmapCanvas.getContext('2d');
heatmapCanvas.width = 300;
heatmapCanvas.height = 150;

function updateHeatmap(x, y) {
    const scaledX = (x / canvasElement.width) * heatmapCanvas.width;
    const scaledY = (y / canvasElement.height) * heatmapCanvas.height;
    
    heatmapData.push({ x: scaledX, y: scaledY, intensity: 1 });
    
    // 限制数据点数量
    if (heatmapData.length > 500) {
        heatmapData.shift();
    }
    
    drawHeatmap();
}

function drawHeatmap() {
    heatmapCtx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    heatmapCtx.fillRect(0, 0, heatmapCanvas.width, heatmapCanvas.height);
    
    heatmapData.forEach(point => {
        const gradient = heatmapCtx.createRadialGradient(point.x, point.y, 0, point.x, point.y, 20);
        gradient.addColorStop(0, 'rgba(255, 0, 0, 0.8)');
        gradient.addColorStop(0.5, 'rgba(255, 255, 0, 0.4)');
        gradient.addColorStop(1, 'rgba(0, 255, 0, 0)');
        
        heatmapCtx.fillStyle = gradient;
        heatmapCtx.fillRect(point.x - 20, point.y - 20, 40, 40);
    });
}

// ========== 3D 手部可视化 ==========
const hand3DCanvas = document.getElementById('hand3DCanvas');
const hand3DCtx = hand3DCanvas.getContext('2d');
hand3DCanvas.width = 350;
hand3DCanvas.height = 200;

function draw3DHandModel(landmarks) {
    hand3DCtx.fillStyle = 'rgba(0, 0, 0, 0.8)';
    hand3DCtx.fillRect(0, 0, hand3DCanvas.width, hand3DCanvas.height);
    
    if (!landmarks) return;
    
    // 绘制3D投影
    const centerX = hand3DCanvas.width / 2;
    const centerY = hand3DCanvas.height / 2;
    const scale = 150;
    
    // 手部连接
    const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4], // 拇指
        [0, 5], [5, 6], [6, 7], [7, 8], // 食指
        [0, 9], [9, 10], [10, 11], [11, 12], // 中指
        [0, 13], [13, 14], [14, 15], [15, 16], // 无名指
        [0, 17], [17, 18], [18, 19], [19, 20], // 小指
        [5, 9], [9, 13], [13, 17] // 手掌
    ];
    
    // 绘制连接线
    hand3DCtx.strokeStyle = '#00ffff';
    hand3DCtx.lineWidth = 2;
    hand3DCtx.shadowBlur = 10;
    hand3DCtx.shadowColor = '#00ffff';
    
    connections.forEach(([start, end]) => {
        const startPoint = landmarks[start];
        const endPoint = landmarks[end];
        
        const x1 = centerX + (startPoint.x - 0.5) * scale;
        const y1 = centerY + (startPoint.y - 0.5) * scale;
        const x2 = centerX + (endPoint.x - 0.5) * scale;
        const y2 = centerY + (endPoint.y - 0.5) * scale;
        
        hand3DCtx.beginPath();
        hand3DCtx.moveTo(x1, y1);
        hand3DCtx.lineTo(x2, y2);
        hand3DCtx.stroke();
    });
    
    // 绘制关节点
    landmarks.forEach((landmark, index) => {
        const x = centerX + (landmark.x - 0.5) * scale;
        const y = centerY + (landmark.y - 0.5) * scale;
        const z = landmark.z * 50; // Z深度影响大小
        
        hand3DCtx.beginPath();
        hand3DCtx.arc(x, y, 4 - z / 50, 0, Math.PI * 2);
        
        // 指尖特殊颜色
        if ([4, 8, 12, 16, 20].includes(index)) {
            hand3DCtx.fillStyle = '#ff00ff';
            hand3DCtx.shadowColor = '#ff00ff';
        } else {
            hand3DCtx.fillStyle = '#00ffff';
            hand3DCtx.shadowColor = '#00ffff';
        }
        
        hand3DCtx.fill();
    });
    
    hand3DCtx.shadowBlur = 0;
}

// ========== 运动追踪图表 ==========
const motionChart = new Chart(document.getElementById('motionChart'), {
    type: 'line',
    data: {
        labels: Array(30).fill(''),
        datasets: [{
            label: 'Left Hand Velocity',
            data: Array(30).fill(0),
            borderColor: '#00ffff',
            backgroundColor: 'rgba(0, 255, 255, 0.1)',
            tension: 0.4,
            fill: true
        }, {
            label: 'Right Hand Velocity',
            data: Array(30).fill(0),
            borderColor: '#ff00ff',
            backgroundColor: 'rgba(255, 0, 255, 0.1)',
            tension: 0.4,
            fill: true
        }]
    },
    options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false }
        },
        scales: {
            x: { display: false },
            y: {
                display: true,
                ticks: { color: '#00ffff', font: { size: 8 } },
                grid: { color: 'rgba(0, 255, 255, 0.1)' }
            }
        }
    }
});

// ========== 手势识别 ==========
function recognizeGesture(landmarks) {
    if (!landmarks) return 'NONE';
    
    const fingerTips = [4, 8, 12, 16, 20];
    const fingerBases = [2, 5, 9, 13, 17];
    
    // 计算手指是否伸直
    const fingersExtended = fingerTips.map((tip, i) => {
        const tipY = landmarks[tip].y;
        const baseY = landmarks[fingerBases[i]].y;
        return tipY < baseY - 0.05;
    });
    
    const extendedCount = fingersExtended.filter(Boolean).length;
    
    // 识别手势
    if (extendedCount === 0) return '✊ FIST';
    if (extendedCount === 5) return '🖐️ OPEN PALM';
    if (fingersExtended[1] && !fingersExtended[2] && !fingersExtended[3] && !fingersExtended[4]) return '👆 POINTING';
    if (fingersExtended[1] && fingersExtended[2] && !fingersExtended[3] && !fingersExtended[4]) return '✌️ PEACE';
    if (fingersExtended[0] && fingersExtended[1] && !fingersExtended[2] && !fingersExtended[3] && !fingersExtended[4]) return '🤏 PINCH';
    
    // 检测OK手势
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const distance = Math.sqrt(
        Math.pow(thumbTip.x - indexTip.x, 2) +
        Math.pow(thumbTip.y - indexTip.y, 2)
    );
    if (distance < 0.05 && fingersExtended[2] && fingersExtended[3] && fingersExtended[4]) {
        return '👌 OK';
    }
    
    return 'CUSTOM';
}

// 更新手势显示
function updateGestureDisplay(gesture) {
    const gestures = document.querySelectorAll('.gesture-badge');
    gestures.forEach(badge => {
        const badgeText = badge.textContent;
        badge.classList.toggle('active', badgeText.includes(gesture.replace(/[🖐️✊👆✌️🤏👌]/g, '').trim()));
    });
}

// ========== 更新性能指标 ==========
function updateMetrics(currentTime) {
    // FPS
    frameCount++;
    if (currentTime - lastTime >= 1000) {
        fps = frameCount;
        frameCount = 0;
        lastTime = currentTime;
    }
    document.getElementById('fps').textContent = fps;
    
    // 延迟 (简化计算)
    const latency = Math.round(1000 / fps);
    document.getElementById('latency').textContent = latency;
    
    // 运行时间
    const uptime = Math.floor((Date.now() - startTime) / 1000);
    const hours = Math.floor(uptime / 3600).toString().padStart(2, '0');
    const minutes = Math.floor((uptime % 3600) / 60).toString().padStart(2, '0');
    const seconds = (uptime % 60).toString().padStart(2, '0');
    document.getElementById('uptime').textContent = `${hours}:${minutes}:${seconds}`;
    
    // 总帧数
    document.getElementById('totalFrames').textContent = Math.floor(performance.now() / 16.67);
    
    // CPU和内存 (模拟值)
    const cpuUsage = 40 + Math.random() * 20;
    document.getElementById('cpuUsage').textContent = cpuUsage.toFixed(0);
    
    if (performance.memory) {
        const memoryMB = (performance.memory.usedJSHeapSize / 1048576).toFixed(0);
        document.getElementById('memory').textContent = memoryMB;
    }
}

// ========== MediaPipe 结果处理 ==========
function onResults(results) {
    // 隐藏加载界面
    if (loadingScreen && loadingScreen.style.display !== 'none') {
        loadingScreen.style.display = 'none';
    }
    
    const currentTime = performance.now();
    updateMetrics(currentTime);
    
    // 绘制视频帧
    canvasCtx.save();
    canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    
    if (results.image) {
        canvasCtx.drawImage(results.image, 0, 0, canvasElement.width, canvasElement.height);
    }
    
    // 处理手部数据
    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        detectionCount += results.multiHandLandmarks.length;
        
        // 更新检测率
        const detectionRate = Math.min((detectionCount / (performance.now() / 1000)) * 100, 100);
        document.getElementById('detectionRate').textContent = detectionRate.toFixed(0) + '%';
        
        results.multiHandLandmarks.forEach((landmarks, index) => {
            const handedness = results.multiHandedness[index].label;
            
            // 绘制增强的手部骨架
            drawEnhancedHand(canvasCtx, landmarks, handedness);
            
            // 更新数据面板
            updateDataPanels(results.multiHandLandmarks, results.multiHandedness);
            
            // 识别手势
            const gesture = recognizeGesture(landmarks);
            document.getElementById('activeGesture').textContent = gesture;
            updateGestureDisplay(gesture);
            
            // 3D模型 (只显示第一只手)
            if (index === 0) {
                draw3DHandModel(landmarks);
            }
            
            // 运动追踪
            trackMotion(landmarks, handedness);
            
            // 生成粒子效果
            const indexTip = landmarks[8];
            const x = indexTip.x * canvasElement.width;
            const y = indexTip.y * canvasElement.height;
            
            if (particles.length < 200 && Math.random() > 0.7) {
                particles.push(new Particle(x, y, handedness === 'Left' ? '#ff00ff' : '#00ffff'));
            }
            
            // 更新热力图
            updateHeatmap(x, y);
            
            // 计算捏合距离 (只显示第一只手)
            if (index === 0) {
                const thumbTip = landmarks[4];
                const indexTip8 = landmarks[8];
                const pinchDist = Math.sqrt(
                    Math.pow(thumbTip.x - indexTip8.x, 2) +
                    Math.pow(thumbTip.y - indexTip8.y, 2)
                );
                document.getElementById('pinchDistance').textContent = pinchDist.toFixed(3);
            }
        });
    } else {
        // 没有检测到手
        document.getElementById('handsCount').textContent = '0';
        document.getElementById('activeGesture').textContent = 'NONE';
        document.getElementById('handedness').textContent = 'N/A';
    }

    // 处理面部数据
    if (results.faceLandmarks && results.faceLandmarks.length > 0) {
        try {
            // 绘制面部轮廓
            canvasCtx.strokeStyle = '#00ffff';
            canvasCtx.lineWidth = 2;
            canvasCtx.shadowBlur = 10;
            canvasCtx.shadowColor = '#00ffff';
            
            // 绘制所有面部点
            results.faceLandmarks.forEach((landmark, index) => {
                const x = landmark.x * canvasElement.width;
                const y = landmark.y * canvasElement.height;
                
                canvasCtx.beginPath();
                canvasCtx.arc(x, y, 1, 0, Math.PI * 2);
                canvasCtx.fillStyle = '#00ffff';
                canvasCtx.fill();
                
                // 高亮关键点
                if ([1, 4, 5, 195, 168, 33, 263, 61, 291].includes(index)) {
                    canvasCtx.beginPath();
                    canvasCtx.arc(x, y, 3, 0, Math.PI * 2);
                    canvasCtx.fillStyle = '#ff00ff';
                    canvasCtx.fill();
                }
            });
            
            canvasCtx.shadowBlur = 0;
            
            document.getElementById('facesCount').textContent = '1';
            document.getElementById('faceLandmarkCount').textContent = results.faceLandmarks.length;
        } catch (e) {
            console.warn('Face drawing error:', e);
        }
    } else {
        document.getElementById('facesCount').textContent = '0';
        document.getElementById('faceLandmarkCount').textContent = '0';
    }

    // 处理姿态数据
    if (results.poseLandmarks && results.poseLandmarks.length > 0) {
        try {
            // 身体连接关系
            const poseConnections = [
                [0, 1], [1, 2], [2, 3], [3, 7], // 头部
                [0, 4], [4, 5], [5, 6], [6, 8], // 头部
                [9, 10], // 嘴
                [11, 12], // 肩膀
                [11, 13], [13, 15], [15, 17], [15, 19], [15, 21], // 左臂
                [12, 14], [14, 16], [16, 18], [16, 20], [16, 22], // 右臂
                [11, 23], [12, 24], [23, 24], // 躯干
                [23, 25], [25, 27], [27, 29], [27, 31], // 左腿
                [24, 26], [26, 28], [28, 30], [28, 32]  // 右腿
            ];
            
            // 绘制连接线
            canvasCtx.strokeStyle = '#00ff00';
            canvasCtx.lineWidth = 3;
            canvasCtx.shadowBlur = 10;
            canvasCtx.shadowColor = '#00ff00';
            
            poseConnections.forEach(([start, end]) => {
                if (results.poseLandmarks[start] && results.poseLandmarks[end]) {
                    const startLm = results.poseLandmarks[start];
                    const endLm = results.poseLandmarks[end];
                    
                    if (startLm.visibility > 0.5 && endLm.visibility > 0.5) {
                        const x1 = startLm.x * canvasElement.width;
                        const y1 = startLm.y * canvasElement.height;
                        const x2 = endLm.x * canvasElement.width;
                        const y2 = endLm.y * canvasElement.height;
                        
                        canvasCtx.beginPath();
                        canvasCtx.moveTo(x1, y1);
                        canvasCtx.lineTo(x2, y2);
                        canvasCtx.stroke();
                    }
                }
            });
            
            // 绘制关节点
            results.poseLandmarks.forEach((landmark, index) => {
                if (landmark.visibility > 0.5) {
                    const x = landmark.x * canvasElement.width;
                    const y = landmark.y * canvasElement.height;
                    
                    canvasCtx.beginPath();
                    canvasCtx.arc(x, y, 5, 0, Math.PI * 2);
                    canvasCtx.fillStyle = '#ff0000';
                    canvasCtx.shadowColor = '#ff0000';
                    canvasCtx.fill();
                }
            });
            
            canvasCtx.shadowBlur = 0;
            
            document.getElementById('posesCount').textContent = '1';
            document.getElementById('poseLandmarkCount').textContent = results.poseLandmarks.length;
            const visibleLandmarks = results.poseLandmarks.filter(lm => lm.visibility && lm.visibility > 0.5);
            const visibility = (visibleLandmarks.length / results.poseLandmarks.length) * 100;
            document.getElementById('poseVisibility').textContent = `${visibility.toFixed(0)}%`;
        } catch (e) {
            console.warn('Pose drawing error:', e);
        }
    } else {
        document.getElementById('posesCount').textContent = '0';
        document.getElementById('poseLandmarkCount').textContent = '0';
        document.getElementById('poseVisibility').textContent = '0%';
    }
    
    canvasCtx.restore();
}

// ========== 绘制增强的手部骨架 ==========
function drawEnhancedHand(ctx, landmarks, handedness) {
    const color = handedness === 'Left' ? '#ff00ff' : '#00ffff';
    const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4], // 拇指
        [0, 5], [5, 6], [6, 7], [7, 8], // 食指
        [0, 9], [9, 10], [10, 11], [11, 12], // 中指
        [0, 13], [13, 14], [14, 15], [15, 16], // 无名指
        [0, 17], [17, 18], [18, 19], [19, 20], // 小指
        [5, 9], [9, 13], [13, 17] // 手掌
    ];
    
    // 绘制发光连接线
    connections.forEach(([start, end]) => {
        const startPoint = landmarks[start];
        const endPoint = landmarks[end];
        
        const x1 = startPoint.x * canvasElement.width;
        const y1 = startPoint.y * canvasElement.height;
        const x2 = endPoint.x * canvasElement.width;
        const y2 = endPoint.y * canvasElement.height;
        
        const gradient = ctx.createLinearGradient(x1, y1, x2, y2);
        gradient.addColorStop(0, color);
        gradient.addColorStop(0.5, '#00ff00');
        gradient.addColorStop(1, '#ffff00');
        
        ctx.strokeStyle = gradient;
        ctx.lineWidth = 4;
        ctx.shadowBlur = 15;
        ctx.shadowColor = color;
        
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    });
    
    // 绘制关节点
    landmarks.forEach((landmark, index) => {
        const x = landmark.x * canvasElement.width;
        const y = landmark.y * canvasElement.height;
        
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        
        // 指尖特殊标记
        if ([4, 8, 12, 16, 20].includes(index)) {
            ctx.fillStyle = handedness === 'Left' ? '#ff00ff' : '#00ffff';
            ctx.shadowColor = handedness === 'Left' ? '#ff00ff' : '#00ffff';
            ctx.shadowBlur = 20;
        } else {
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 15;
        }
        
        ctx.fill();
        
        // 绘制关键点标签
        if ([4, 8, 12, 16, 20].includes(index)) {
            const labels = ['THUMB', 'INDEX', 'MIDDLE', 'RING', 'PINKY'];
            const labelIndex = [4, 8, 12, 16, 20].indexOf(index);
            
            ctx.shadowBlur = 0;
            ctx.fillStyle = '#00ffff';
            ctx.font = 'bold 10px monospace';
            ctx.fillText(labels[labelIndex], x + 10, y - 10);
        }
    });
    
    ctx.shadowBlur = 0;
}

// ========== 更新数据面板 ==========
function updateDataPanels(multiHandLandmarks, multiHandedness) {
    // 手部追踪数据
    document.getElementById('handsCount').textContent = multiHandLandmarks.length;
    const handednessStr = multiHandedness.map(h => h.label).join(', ');
    document.getElementById('handedness').textContent = handednessStr;
    
    // 指尖位置
    const leftHand = multiHandedness.findIndex(h => h.label === 'Left');
    const rightHand = multiHandedness.findIndex(h => h.label === 'Right');

    if (leftHand !== -1) {
        const landmark = multiHandLandmarks[leftHand][8]; // Index finger tip
        const text = `X:${landmark.x.toFixed(2)}, Y:${landmark.y.toFixed(2)}, Z:${landmark.z.toFixed(2)}`;
        document.getElementById('leftIndexPos').textContent = text;
    } else {
        document.getElementById('leftIndexPos').textContent = 'N/A';
    }

    if (rightHand !== -1) {
        const landmark = multiHandLandmarks[rightHand][8]; // Index finger tip
        const text = `X:${landmark.x.toFixed(2)}, Y:${landmark.y.toFixed(2)}, Z:${landmark.z.toFixed(2)}`;
        document.getElementById('rightIndexPos').textContent = text;
    } else {
        document.getElementById('rightIndexPos').textContent = 'N/A';
    }
}

// ========== 运动追踪 ==========
function trackMotion(landmarks, handedness) {
    const indexTip = landmarks[8];
    const currentPos = { x: indexTip.x, y: indexTip.y };
    const lastPosition = handedness === 'Left' ? lastLeftPosition : lastRightPosition;
    
    if (lastPosition) {
        const dx = currentPos.x - lastPosition.x;
        const dy = currentPos.y - lastPosition.y;
        const velocity = Math.sqrt(dx * dx + dy * dy) * 1000; // px/s
        
        const datasetIndex = handedness === 'Left' ? 0 : 1;
        motionChart.data.datasets[datasetIndex].data.push(velocity);
        if (motionChart.data.datasets[datasetIndex].data.length > 30) {
            motionChart.data.datasets[datasetIndex].data.shift();
        }
        motionChart.update('none');
        
        // 更新显示 (只显示第一只手的数据)
        if (handedness === 'Right') {
            document.getElementById('velocity').textContent = velocity.toFixed(2) + ' px/s';
            const history = motionChart.data.datasets[datasetIndex].data;
            if (history.length > 1) {
                const acceleration = history[history.length - 1] - history[history.length - 2];
                document.getElementById('acceleration').textContent = acceleration.toFixed(2) + ' px/s²';
            }
            const movement = velocity < 50 ? 'STATIC' : velocity < 200 ? 'SLOW' : velocity < 500 ? 'MEDIUM' : 'FAST';
            document.getElementById('movement').textContent = movement;
        }
    }
    
    if (handedness === 'Left') {
        lastLeftPosition = currentPos;
    } else {
        lastRightPosition = currentPos;
    }
}

// ========== 工具函数 ==========
function getRandomColor() {
    const colors = ['#00ffff', '#00ff00', '#ffff00', '#ff00ff', '#00ffaa'];
    return colors[Math.floor(Math.random() * colors.length)];
}

// ========== 初始化 MediaPipe ==========
let modelsEnabled = { hands: true, face: true, pose: true };
let combinedResults = {};

console.log('🔍 Checking MediaPipe availability...');
console.log('Hands:', typeof Hands !== 'undefined' ? '✅' : '❌');
console.log('FaceMesh:', typeof FaceMesh !== 'undefined' ? '✅' : '❌');
console.log('Pose:', typeof Pose !== 'undefined' ? '✅' : '❌');
console.log('Camera:', typeof Camera !== 'undefined' ? '✅' : '❌');

// 初始化手部追踪
const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
});

hands.setOptions({
    maxNumHands: 2,
    modelComplexity: 0,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

hands.onResults((results) => {
    combinedResults.multiHandLandmarks = results.multiHandLandmarks;
    combinedResults.multiHandedness = results.multiHandedness;
    combinedResults.image = results.image;
});

// 初始化面部网格
const faceMesh = new FaceMesh({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
});

faceMesh.setOptions({
    maxNumFaces: 1,
    refineLandmarks: false,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

faceMesh.onResults((results) => {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        combinedResults.faceLandmarks = results.multiFaceLandmarks[0];
    }
});

// 初始化姿态估计
const pose = new Pose({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/pose/${file}`
});

pose.setOptions({
    modelComplexity: 0,
    smoothLandmarks: true,
    minDetectionConfidence: 0.5,
    minTrackingConfidence: 0.5
});

pose.onResults((results) => {
    combinedResults.poseLandmarks = results.poseLandmarks;
});

// 添加模型切换监听器
document.addEventListener('DOMContentLoaded', () => {
    const handsToggle = document.getElementById('handsToggle');
    const faceToggle = document.getElementById('faceToggle');
    const poseToggle = document.getElementById('poseToggle');
    
    if (handsToggle) {
        handsToggle.addEventListener('change', (e) => {
            modelsEnabled.hands = e.target.checked;
        });
    }
    
    if (faceToggle) {
        faceToggle.addEventListener('change', (e) => {
            modelsEnabled.face = e.target.checked;
        });
    }
    
    if (poseToggle) {
        poseToggle.addEventListener('change', (e) => {
            modelsEnabled.pose = e.target.checked;
        });
    }
});

// ========== 初始化摄像头 ==========
let frameProcessing = false;

const camera = new Camera(videoElement, {
    onFrame: async () => {
        if (frameProcessing) return;
        frameProcessing = true;
        
        try {
            combinedResults = { image: videoElement };
            
            // 并发发送到所有启用的模型
            const promises = [];
            
            if (modelsEnabled.hands) {
                promises.push(hands.send({ image: videoElement }));
            }
            if (modelsEnabled.face) {
                promises.push(faceMesh.send({ image: videoElement }));
            }
            if (modelsEnabled.pose) {
                promises.push(pose.send({ image: videoElement }));
            }
            
            // 等待所有模型处理完成
            await Promise.all(promises);
            
            // 短暂延迟确保所有回调完成
            await new Promise(resolve => setTimeout(resolve, 5));
            
            // 处理合并后的结果
            onResults(combinedResults);
        } catch (error) {
            console.error('Frame processing error:', error);
        } finally {
            frameProcessing = false;
        }
    },
    width: 1280,
    height: 720
});

// 启动摄像头和系统
async function initializeSystem() {
    try {
        console.log('🔄 Starting camera...');
        updateLoadingText('Starting camera...');
        
        await camera.start();
        
        console.log('✅ Camera started');
        updateLoadingText('Camera ready! Loading models...');
        
        // 等待一小段时间让第一帧处理
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('✅ Neural Vision Dashboard Initialized');
        
        // 隐藏加载界面
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
        
        if (document.getElementById('systemStatus')) {
            document.getElementById('systemStatus').textContent = 'ONLINE';
        }
    } catch (error) {
        console.error('❌ Initialization Error:', error);
        updateLoadingText('ERROR: ' + error.message);
        
        if (document.getElementById('systemStatus')) {
            document.getElementById('systemStatus').textContent = 'OFFLINE';
        }
        
        // 显示详细错误
        setTimeout(() => {
            alert('摄像头启动失败：\n' + error.message + '\n\n请检查：\n1. 浏览器是否允许摄像头权限\n2. 摄像头是否被其他程序占用\n3. 使用Chrome或Edge浏览器');
        }, 500);
    }
}

function updateLoadingText(text) {
    if (loadingScreen) {
        const loadingText = loadingScreen.querySelector('.loading-text');
        if (loadingText) {
            loadingText.textContent = text;
        }
    }
}

// 页面加载完成后初始化
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(initializeSystem, 500);
    });
} else {
    setTimeout(initializeSystem, 500);
}

// ========== 窗口调整 ==========
window.addEventListener('resize', () => {
    matrixCanvas.width = window.innerWidth;
    matrixCanvas.height = window.innerHeight;
});

console.log('🌟 Visualization Dashboard Ready!');
