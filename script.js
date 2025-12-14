/* ========================================
   VIRTUAL SWARM DRONE SIMULATOR - ENGINE
   Defence Training Platform v2.0
   ======================================== */

// ========== GLOBAL VARIABLES ==========
let scene, camera, renderer, controls;
let drones = [];
let obstacles = [];
let waypoints = [];
let terrain;
let animationId;
let clock = new THREE.Clock();

// Simulation State
const simulationState = {
    isRunning: false,
    isPaused: false,
    droneCount: 50,
    formationType: 'grid',
    behaviorMode: 'decentralized',
    currentMission: 'STANDBY',
    timeElapsed: 0,
    missionScore: 0,
    activeDrones: 0,
    collisionsAvoided: 0,
    signalStrength: 100,
    coverageArea: 0
};

// Swarm Parameters
const swarmParams = {
    speed: 5,
    spacing: 10,
    commLatency: 50,
    separationWeight: 1.5,
    alignmentWeight: 1.0,
    cohesionWeight: 1.0,
    goalWeight: 2.0,
    perceptionRadius: 30,
    separationRadius: 15,
    maxSpeed: 20,
    maxForce: 0.5
};

// Terrain Configuration
const terrainConfig = {
    type: 'urban',
    timeOfDay: 'day',
    weather: 'clear',
    size: 2000
};

// Event Log
const eventLog = [];

// Charts
let velocityChart, positionChart;

// ========== INITIALIZATION ==========
document.addEventListener('DOMContentLoaded', function() {
    initThreeJS();
    initUI();
    initCharts();
    initEventListeners();
    startClock();
    animate();
    logEvent('System initialized successfully', 'info');
});

// ========== THREE.JS SETUP ==========
function initThreeJS() {
    const canvas = document.getElementById('droneCanvas');
    const container = canvas.parentElement;
    
    // Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0a0e27, 500, 2000);
    scene.background = new THREE.Color(0x0a0e27);
    
    // Camera
    camera = new THREE.PerspectiveCamera(
        60,
        container.clientWidth / container.clientHeight,
        0.1,
        5000
    );
    camera.position.set(200, 150, 200);
    camera.lookAt(0, 0, 0);
    
    // Renderer
    renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        antialias: true,
        alpha: true
    });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    
    // Lighting
    const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
    scene.add(ambientLight);
    
    const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
    directionalLight.position.set(200, 400, 100);
    directionalLight.castShadow = true;
    directionalLight.shadow.camera.left = -500;
    directionalLight.shadow.camera.right = 500;
    directionalLight.shadow.camera.top = 500;
    directionalLight.shadow.camera.bottom = -500;
    scene.add(directionalLight);
    
    // Point lights for atmosphere
    const pointLight1 = new THREE.PointLight(0x00d4ff, 0.5, 500);
    pointLight1.position.set(0, 200, 0);
    scene.add(pointLight1);
    
    // Create Terrain
    createTerrain();
    
    // Create Initial Swarm
    createSwarm(simulationState.droneCount);
    
    // Create Obstacles
    createObstacles();
    
    // Grid Helper
    const gridHelper = new THREE.GridHelper(2000, 50, 0x00d4ff, 0x2a3150);
    scene.add(gridHelper);
    
    // Axes Helper
    const axesHelper = new THREE.AxesHelper(100);
    scene.add(axesHelper);
    
    // Handle window resize
    window.addEventListener('resize', onWindowResize);
}

function createTerrain() {
    // Create ground plane
    const groundGeometry = new THREE.PlaneGeometry(2000, 2000, 100, 100);
    
    // Add some elevation variation
    const vertices = groundGeometry.attributes.position.array;
    for (let i = 0; i < vertices.length; i += 3) {
        vertices[i + 2] = Math.random() * 5; // Random height variation
    }
    groundGeometry.computeVertexNormals();
    
    const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x1a2f3a,
        roughness: 0.8,
        metalness: 0.2,
        wireframe: false
    });
    
    terrain = new THREE.Mesh(groundGeometry, groundMaterial);
    terrain.rotation.x = -Math.PI / 2;
    terrain.receiveShadow = true;
    scene.add(terrain);
    
    // Add urban buildings for urban terrain
    if (terrainConfig.type === 'urban') {
        createUrbanBuildings();
    }
}

function createUrbanBuildings() {
    const buildingCount = 30;
    for (let i = 0; i < buildingCount; i++) {
        const width = 20 + Math.random() * 40;
        const height = 30 + Math.random() * 100;
        const depth = 20 + Math.random() * 40;
        
        const geometry = new THREE.BoxGeometry(width, height, depth);
        const material = new THREE.MeshStandardMaterial({
            color: 0x2a3150,
            roughness: 0.7,
            metalness: 0.3
        });
        
        const building = new THREE.Mesh(geometry, material);
        building.position.set(
            (Math.random() - 0.5) * 1500,
            height / 2,
            (Math.random() - 0.5) * 1500
        );
        building.castShadow = true;
        building.receiveShadow = true;
        scene.add(building);
        obstacles.push(building);
    }
}

function createObstacles() {
    // Create some obstacle spheres
    for (let i = 0; i < 10; i++) {
        const geometry = new THREE.SphereGeometry(15, 16, 16);
        const material = new THREE.MeshStandardMaterial({
            color: 0xff4757,
            transparent: true,
            opacity: 0.3,
            wireframe: true
        });
        
        const obstacle = new THREE.Mesh(geometry, material);
        obstacle.position.set(
            (Math.random() - 0.5) * 1000,
            50 + Math.random() * 100,
            (Math.random() - 0.5) * 1000
        );
        scene.add(obstacle);
        obstacles.push(obstacle);
    }
}

// ========== DRONE CLASS ==========
class Drone {
    constructor(id, position) {
        this.id = id;
        this.position = position.clone();
        this.velocity = new THREE.Vector3(
            (Math.random() - 0.5) * 2,
            0,
            (Math.random() - 0.5) * 2
        );
        this.acceleration = new THREE.Vector3();
        this.target = null;
        this.battery = 100;
        this.status = 'active';
        this.commDelay = 0;
        
        // Create 3D model
        this.createModel();
    }
    
    createModel() {
        const group = new THREE.Group();
        
        // Body
        const bodyGeometry = new THREE.BoxGeometry(2, 0.5, 2);
        const bodyMaterial = new THREE.MeshStandardMaterial({
            color: 0x00d4ff,
            metalness: 0.8,
            roughness: 0.2
        });
        const body = new THREE.Mesh(bodyGeometry, bodyMaterial);
        group.add(body);
        
        // Arms and rotors
        const armGeometry = new THREE.BoxGeometry(0.2, 0.2, 1.5);
        const armMaterial = new THREE.MeshStandardMaterial({ color: 0x2a3150 });
        
        const rotorGeometry = new THREE.CylinderGeometry(0.8, 0.8, 0.1, 16);
        const rotorMaterial = new THREE.MeshStandardMaterial({
            color: 0x00ff88,
            transparent: true,
            opacity: 0.3
        });
        
        const positions = [
            { x: 1, z: 1 },
            { x: -1, z: 1 },
            { x: 1, z: -1 },
            { x: -1, z: -1 }
        ];
        
        positions.forEach(pos => {
            const arm = new THREE.Mesh(armGeometry, armMaterial);
            arm.position.set(pos.x * 0.5, 0, pos.z * 0.5);
            arm.rotation.y = Math.atan2(pos.z, pos.x);
            group.add(arm);
            
            const rotor = new THREE.Mesh(rotorGeometry, rotorMaterial);
            rotor.position.set(pos.x, 0.5, pos.z);
            group.add(rotor);
        });
        
        // Light indicator
        const lightGeometry = new THREE.SphereGeometry(0.2, 8, 8);
        const lightMaterial = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
        const light = new THREE.Mesh(lightGeometry, lightMaterial);
        light.position.y = 0.5;
        group.add(light);
        
        group.position.copy(this.position);
        scene.add(group);
        this.mesh = group;
    }
    
    // Swarm AI Behaviors
    applyBehaviors(neighbors) {
        const separation = this.separate(neighbors);
        const alignment = this.align(neighbors);
        const cohesion = this.cohere(neighbors);
        const goal = this.seekGoal();
        const avoid = this.avoidObstacles();
        
        // Apply weights
        separation.multiplyScalar(swarmParams.separationWeight);
        alignment.multiplyScalar(swarmParams.alignmentWeight);
        cohesion.multiplyScalar(swarmParams.cohesionWeight);
        goal.multiplyScalar(swarmParams.goalWeight);
        avoid.multiplyScalar(3.0);
        
        // Accumulate forces
        this.acceleration.add(separation);
        this.acceleration.add(alignment);
        this.acceleration.add(cohesion);
        this.acceleration.add(goal);
        this.acceleration.add(avoid);
    }
    
    separate(neighbors) {
        const steer = new THREE.Vector3();
        let count = 0;
        
        neighbors.forEach(other => {
            const distance = this.position.distanceTo(other.position);
            if (distance > 0 && distance < swarmParams.separationRadius) {
                const diff = new THREE.Vector3()
                    .subVectors(this.position, other.position)
                    .normalize()
                    .divideScalar(distance);
                steer.add(diff);
                count++;
            }
        });
        
        if (count > 0) {
            steer.divideScalar(count);
            steer.normalize();
            steer.multiplyScalar(swarmParams.maxSpeed);
            steer.sub(this.velocity);
            steer.clampLength(0, swarmParams.maxForce);
        }
        
        return steer;
    }
    
    align(neighbors) {
        const sum = new THREE.Vector3();
        let count = 0;
        
        neighbors.forEach(other => {
            const distance = this.position.distanceTo(other.position);
            if (distance > 0 && distance < swarmParams.perceptionRadius) {
                sum.add(other.velocity);
                count++;
            }
        });
        
        if (count > 0) {
            sum.divideScalar(count);
            sum.normalize();
            sum.multiplyScalar(swarmParams.maxSpeed);
            const steer = new THREE.Vector3().subVectors(sum, this.velocity);
            steer.clampLength(0, swarmParams.maxForce);
            return steer;
        }
        
        return new THREE.Vector3();
    }
    
    cohere(neighbors) {
        const sum = new THREE.Vector3();
        let count = 0;
        
        neighbors.forEach(other => {
            const distance = this.position.distanceTo(other.position);
            if (distance > 0 && distance < swarmParams.perceptionRadius) {
                sum.add(other.position);
                count++;
            }
        });
        
        if (count > 0) {
            sum.divideScalar(count);
            return this.seek(sum);
        }
        
        return new THREE.Vector3();
    }
    
    seek(target) {
        const desired = new THREE.Vector3().subVectors(target, this.position);
        desired.normalize();
        desired.multiplyScalar(swarmParams.maxSpeed);
        const steer = new THREE.Vector3().subVectors(desired, this.velocity);
        steer.clampLength(0, swarmParams.maxForce);
        return steer;
    }
    
    seekGoal() {
        if (waypoints.length > 0) {
            const target = waypoints[0];
            return this.seek(target);
        }
        return new THREE.Vector3();
    }
    
    avoidObstacles() {
        const avoidForce = new THREE.Vector3();
        
        obstacles.forEach(obstacle => {
            const distance = this.position.distanceTo(obstacle.position);
            const avoidRadius = 50;
            
            if (distance < avoidRadius) {
                const diff = new THREE.Vector3()
                    .subVectors(this.position, obstacle.position)
                    .normalize()
                    .multiplyScalar(avoidRadius - distance);
                avoidForce.add(diff);
                simulationState.collisionsAvoided++;
            }
        });
        
        return avoidForce;
    }
    
    update(deltaTime) {
        // Apply behaviors
        const neighbors = drones.filter(d => d.id !== this.id);
        this.applyBehaviors(neighbors);
        
        // Update velocity
        this.velocity.add(this.acceleration);
        this.velocity.clampLength(0, swarmParams.speed);
        
        // Update position
        const movement = this.velocity.clone().multiplyScalar(deltaTime);
        this.position.add(movement);
        
        // Boundaries
        const boundary = 900;
        if (Math.abs(this.position.x) > boundary) {
            this.velocity.x *= -1;
            this.position.x = Math.sign(this.position.x) * boundary;
        }
        if (Math.abs(this.position.z) > boundary) {
            this.velocity.z *= -1;
            this.position.z = Math.sign(this.position.z) * boundary;
        }
        
        // Keep above ground
        if (this.position.y < 30) {
            this.position.y = 30;
            this.velocity.y = Math.abs(this.velocity.y);
        }
        if (this.position.y > 200) {
            this.position.y = 200;
            this.velocity.y = -Math.abs(this.velocity.y);
        }
        
        // Update battery
        this.battery = Math.max(0, this.battery - deltaTime * 0.01);
        
        // Reset acceleration
        this.acceleration.multiplyScalar(0);
        
        // Update mesh
        if (this.mesh) {
            this.mesh.position.copy(this.position);
            
            // Rotate to face direction
            if (this.velocity.length() > 0.1) {
                const direction = this.velocity.clone().normalize();
                const angle = Math.atan2(direction.x, direction.z);
                this.mesh.rotation.y = angle;
            }
            
            // Spin rotors
            this.mesh.children.forEach((child, index) => {
                if (index > 4) { // Rotor indices
                    child.rotation.y += deltaTime * 50;
                }
            });
        }
    }
}

// ========== SWARM MANAGEMENT ==========
function createSwarm(count) {
    // Clear existing drones
    drones.forEach(drone => {
        if (drone.mesh) {
            scene.remove(drone.mesh);
        }
    });
    drones = [];
    
    // Create formation
    const formation = getFormationPositions(count, simulationState.formationType);
    
    for (let i = 0; i < count; i++) {
        const drone = new Drone(i, formation[i]);
        drones.push(drone);
    }
    
    simulationState.activeDrones = count;
    logEvent(`Swarm created: ${count} drones in ${simulationState.formationType} formation`, 'info');
}

function getFormationPositions(count, type) {
    const positions = [];
    const spacing = swarmParams.spacing;
    
    switch (type) {
        case 'grid':
            const gridSize = Math.ceil(Math.sqrt(count));
            for (let i = 0; i < count; i++) {
                const x = (i % gridSize - gridSize / 2) * spacing;
                const z = (Math.floor(i / gridSize) - gridSize / 2) * spacing;
                positions.push(new THREE.Vector3(x, 100, z));
            }
            break;
            
        case 'vformation':
            const rows = Math.ceil(Math.sqrt(count));
            let index = 0;
            for (let row = 0; row < rows; row++) {
                const dronesInRow = Math.min(row * 2 + 1, count - index);
                for (let col = 0; col < dronesInRow; col++) {
                    const x = (col - dronesInRow / 2) * spacing;
                    const z = -row * spacing;
                    positions.push(new THREE.Vector3(x, 100, z));
                    index++;
                    if (index >= count) break;
                }
                if (index >= count) break;
            }
            break;
            
        case 'circle':
            const radius = spacing * count / (2 * Math.PI);
            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2;
                const x = Math.cos(angle) * radius;
                const z = Math.sin(angle) * radius;
                positions.push(new THREE.Vector3(x, 100, z));
            }
            break;
            
        case 'sphere':
            const phi = Math.PI * (3.0 - Math.sqrt(5.0));
            for (let i = 0; i < count; i++) {
                const y = 1 - (i / (count - 1)) * 2;
                const radiusAtY = Math.sqrt(1 - y * y);
                const theta = phi * i;
                const x = Math.cos(theta) * radiusAtY;
                const z = Math.sin(theta) * radiusAtY;
                positions.push(new THREE.Vector3(
                    x * spacing * 5,
                    100 + y * spacing * 5,
                    z * spacing * 5
                ));
            }
            break;
            
        case 'line':
            for (let i = 0; i < count; i++) {
                const x = (i - count / 2) * spacing;
                positions.push(new THREE.Vector3(x, 100, 0));
            }
            break;
            
        case 'random':
        default:
            for (let i = 0; i < count; i++) {
                const x = (Math.random() - 0.5) * spacing * count / 2;
                const z = (Math.random() - 0.5) * spacing * count / 2;
                const y = 80 + Math.random() * 40;
                positions.push(new THREE.Vector3(x, y, z));
            }
            break;
    }
    
    return positions;
}

// ========== ANIMATION LOOP ==========
function animate() {
    animationId = requestAnimationFrame(animate);
    
    const deltaTime = clock.getDelta();
    
    if (simulationState.isRunning && !simulationState.isPaused) {
        // Update all drones
        drones.forEach(drone => {
            drone.update(deltaTime);
        });
        
        // Update simulation time
        simulationState.timeElapsed += deltaTime;
        
        // Update HUD
        updateHUD();
        
        // Update analytics
        if (Math.random() < 0.1) { // Update 10% of frames
            updateAnalytics();
        }
    }
    
    // Render
    renderer.render(scene, camera);
    
    // Update FPS
    updateFPS();
}

// ========== UI INITIALIZATION ==========
function initUI() {
    // Tab switching
    const tabButtons = document.querySelectorAll('.tab-btn');
    tabButtons.forEach(btn => {
        btn.addEventListener('click', function() {
            const tabName = this.dataset.tab;
            switchTab(tabName);
            
            tabButtons.forEach(b => b.classList.remove('active'));
            this.classList.add('active');
        });
    });
}

function switchTab(tabName) {
    const tabs = document.querySelectorAll('.tab-content');
    tabs.forEach(tab => {
        tab.classList.remove('active');
    });
    
    document.getElementById(tabName + 'Tab').classList.add('active');
}

// ========== CHARTS INITIALIZATION ==========
function initCharts() {
    // Velocity Chart
    const velocityCtx = document.getElementById('velocityChart').getContext('2d');
    velocityChart = new Chart(velocityCtx, {
        type: 'line',
        data: {
            labels: [],
            datasets: [{
                label: 'Average Velocity (m/s)',
                data: [],
                borderColor: '#00d4ff',
                backgroundColor: 'rgba(0, 212, 255, 0.1)',
                tension: 0.4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    beginAtZero: true,
                    grid: { color: '#2a3150' },
                    ticks: { color: '#8b93b0' }
                },
                x: {
                    grid: { color: '#2a3150' },
                    ticks: { color: '#8b93b0' }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#e4e8f0' }
                }
            }
        }
    });
    
    // Position Chart
    const positionCtx = document.getElementById('positionChart').getContext('2d');
    positionChart = new Chart(positionCtx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: 'Drone Positions',
                data: [],
                backgroundColor: '#00ff88',
                pointRadius: 3
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    grid: { color: '#2a3150' },
                    ticks: { color: '#8b93b0' }
                },
                x: {
                    grid: { color: '#2a3150' },
                    ticks: { color: '#8b93b0' }
                }
            },
            plugins: {
                legend: {
                    labels: { color: '#e4e8f0' }
                }
            }
        }
    });
}

// ========== EVENT LISTENERS ==========
function initEventListeners() {
    // Mission Controls
    document.getElementById('startMissionBtn').addEventListener('click', startMission);
    document.getElementById('pauseMissionBtn').addEventListener('click', pauseMission);
    document.getElementById('recallBtn').addEventListener('click', recallSwarm);
    document.getElementById('regroupBtn').addEventListener('click', regroupSwarm);
    
    // Drone Count Slider
    document.getElementById('droneCount').addEventListener('input', function(e) {
        const value = parseInt(e.target.value);
        document.getElementById('droneCountValue').textContent = value;
        simulationState.droneCount = value;
    });
    
    document.getElementById('droneCount').addEventListener('change', function(e) {
        createSwarm(simulationState.droneCount);
    });
    
    // Formation Type
    document.getElementById('formationType').addEventListener('change', function(e) {
        simulationState.formationType = e.target.value;
        createSwarm(simulationState.droneCount);
    });
    
    // Behavior Mode
    document.getElementById('behaviorMode').addEventListener('change', function(e) {
        simulationState.behaviorMode = e.target.value;
        logEvent(`Behavior mode changed to: ${e.target.value}`, 'info');
    });
    
    // Speed Slider
    document.getElementById('swarmSpeed').addEventListener('input', function(e) {
        const value = parseFloat(e.target.value);
        document.getElementById('swarmSpeedValue').textContent = value;
        swarmParams.speed = value;
    });
    
    // Spacing Slider
    document.getElementById('spacing').addEventListener('input', function(e) {
        const value = parseFloat(e.target.value);
        document.getElementById('spacingValue').textContent = value;
        swarmParams.spacing = value;
    });
    
    // Comm Latency
    document.getElementById('commLatency').addEventListener('input', function(e) {
        const value = parseInt(e.target.value);
        document.getElementById('commLatencyValue').textContent = value;
        swarmParams.commLatency = value;
    });
    
    // AI Weight Sliders
    document.getElementById('separationWeight').addEventListener('input', function(e) {
        const value = parseFloat(e.target.value);
        document.getElementById('separationWeightValue').textContent = value;
        swarmParams.separationWeight = value;
    });
    
    document.getElementById('alignmentWeight').addEventListener('input', function(e) {
        const value = parseFloat(e.target.value);
        document.getElementById('alignmentWeightValue').textContent = value;
        swarmParams.alignmentWeight = value;
    });
    
    document.getElementById('cohesionWeight').addEventListener('input', function(e) {
        const value = parseFloat(e.target.value);
        document.getElementById('cohesionWeightValue').textContent = value;
        swarmParams.cohesionWeight = value;
    });
    
    document.getElementById('goalWeight').addEventListener('input', function(e) {
        const value = parseFloat(e.target.value);
        document.getElementById('goalWeightValue').textContent = value;
        swarmParams.goalWeight = value;
    });
    
    // Add Waypoint
    document.getElementById('addWaypointBtn').addEventListener('click', addWaypoint);
    
    // View Controls
    document.getElementById('fpvBtn').addEventListener('click', () => switchView('fpv'));
    document.getElementById('tpvBtn').addEventListener('click', () => switchView('tpv'));
    document.getElementById('swarmViewBtn').addEventListener('click', () => switchView('swarm'));
    
    // Event Log Controls
    document.getElementById('clearEventsBtn').addEventListener('click', clearEventLog);
    document.getElementById('exportEventsBtn').addEventListener('click', exportEventLog);
    
    // Failure Simulations
    document.getElementById('simulateCommFailure').addEventListener('click', simulateCommFailure);
    document.getElementById('simulateNodeFailure').addEventListener('click', simulateNodeFailure);
    document.getElementById('simulatePacketLoss').addEventListener('click', simulatePacketLoss);
    
    // Fullscreen
    document.getElementById('fullscreenBtn').addEventListener('click', toggleFullscreen);
}

// ========== MISSION CONTROLS ==========
function startMission() {
    simulationState.isRunning = true;
    simulationState.isPaused = false;
    simulationState.currentMission = 'TRAINING EXERCISE ALPHA';
    document.getElementById('missionName').textContent = simulationState.currentMission;
    logEvent('Mission started', 'info');
    
    // Add sample waypoint
    if (waypoints.length === 0) {
        addWaypoint();
    }
}

function pauseMission() {
    simulationState.isPaused = !simulationState.isPaused;
    const status = simulationState.isPaused ? 'paused' : 'resumed';
    logEvent(`Mission ${status}`, 'warning');
}

function recallSwarm() {
    waypoints = [new THREE.Vector3(0, 100, 0)];
    logEvent('Recall command issued - returning to base', 'warning');
}

function regroupSwarm() {
    createSwarm(simulationState.droneCount);
    logEvent('Regroup command executed', 'info');
}

// ========== WAYPOINTS ==========
function addWaypoint() {
    const x = (Math.random() - 0.5) * 500;
    const y = 80 + Math.random() * 80;
    const z = (Math.random() - 0.5) * 500;
    
    const waypoint = new THREE.Vector3(x, y, z);
    waypoints.push(waypoint);
    
    // Visual marker
    const geometry = new THREE.SphereGeometry(5, 16, 16);
    const material = new THREE.MeshBasicMaterial({
        color: 0xffd93d,
        transparent: true,
        opacity: 0.6
    });
    const marker = new THREE.Mesh(geometry, material);
    marker.position.copy(waypoint);
    scene.add(marker);
    
    // Update UI
    updateWaypointList();
    logEvent(`Waypoint added: (${x.toFixed(0)}, ${y.toFixed(0)}, ${z.toFixed(0)})`, 'info');
}

function updateWaypointList() {
    const list = document.getElementById('waypointList');
    list.innerHTML = '';
    
    waypoints.forEach((wp, index) => {
        const item = document.createElement('div');
        item.className = 'waypoint-item';
        item.innerHTML = `
            <span>WP${index + 1}: (${wp.x.toFixed(0)}, ${wp.y.toFixed(0)}, ${wp.z.toFixed(0)})</span>
            <button class="btn-icon-sm" onclick="removeWaypoint(${index})">
                <i class="fas fa-times"></i>
            </button>
        `;
        list.appendChild(item);
    });
}

function removeWaypoint(index) {
    waypoints.splice(index, 1);
    updateWaypointList();
}

// ========== VIEW CONTROLS ==========
function switchView(view) {
    const buttons = [
        document.getElementById('fpvBtn'),
        document.getElementById('tpvBtn'),
        document.getElementById('swarmViewBtn')
    ];
    
    buttons.forEach(btn => btn.classList.remove('active'));
    
    switch(view) {
        case 'fpv':
            if (drones.length > 0) {
                camera.position.copy(drones[0].position);
                camera.lookAt(drones[0].position.clone().add(drones[0].velocity));
            }
            document.getElementById('fpvBtn').classList.add('active');
            break;
        case 'tpv':
            camera.position.set(200, 150, 200);
            camera.lookAt(0, 50, 0);
            document.getElementById('tpvBtn').classList.add('active');
            break;
        case 'swarm':
            camera.position.set(0, 400, 0);
            camera.lookAt(0, 0, 0);
            document.getElementById('swarmViewBtn').classList.add('active');
            break;
    }
}

// ========== HUD UPDATES ==========
function updateHUD() {
    if (drones.length > 0) {
        const drone = drones[0];
        
        // Heading
        const heading = Math.atan2(drone.velocity.x, drone.velocity.z) * 180 / Math.PI;
        document.getElementById('heading').textContent = Math.abs(heading).toFixed(0) + '°';
        
        // Altitude
        document.getElementById('altitude').textContent = drone.position.y.toFixed(1) + 'm';
        
        // Speed
        const speed = drone.velocity.length();
        document.getElementById('speed').textContent = speed.toFixed(1) + 'm/s';
        
        // Battery
        document.getElementById('battery').textContent = drone.battery.toFixed(0) + '%';
        
        // GPS
        document.getElementById('gps').textContent = 'LOCKED';
    }
    
    // Terrain info
    document.getElementById('terrainType').textContent = terrainConfig.type.toUpperCase();
    document.getElementById('timeOfDay').textContent = terrainConfig.timeOfDay.toUpperCase();
    document.getElementById('weather').textContent = terrainConfig.weather.toUpperCase();
    
    // Update minimap
    updateMinimap();
}

function updateMinimap() {
    const canvas = document.getElementById('minimapCanvas');
    const ctx = canvas.getContext('2d');
    const size = 150;
    
    // Clear
    ctx.fillStyle = '#0a0e27';
    ctx.fillRect(0, 0, size, size);
    
    // Draw grid
    ctx.strokeStyle = '#2a3150';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
        ctx.beginPath();
        ctx.moveTo(i * size / 10, 0);
        ctx.lineTo(i * size / 10, size);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(0, i * size / 10);
        ctx.lineTo(size, i * size / 10);
        ctx.stroke();
    }
    
    // Draw drones
    const scale = size / 2000;
    drones.forEach(drone => {
        const x = (drone.position.x + 1000) * scale;
        const z = (drone.position.z + 1000) * scale;
        
        ctx.fillStyle = '#00d4ff';
        ctx.beginPath();
        ctx.arc(x, z, 2, 0, Math.PI * 2);
        ctx.fill();
    });
    
    // Draw waypoints
    ctx.fillStyle = '#ffd93d';
    waypoints.forEach(wp => {
        const x = (wp.x + 1000) * scale;
        const z = (wp.z + 1000) * scale;
        
        ctx.beginPath();
        ctx.arc(x, z, 3, 0, Math.PI * 2);
        ctx.fill();
    });
}

// ========== ANALYTICS ==========
function updateAnalytics() {
    // Update stat cards
    document.getElementById('activeDrones').textContent = drones.filter(d => d.status === 'active').length;
    document.getElementById('signalStrength').textContent = simulationState.signalStrength + '%';
    document.getElementById('collisionsAvoided').textContent = simulationState.collisionsAvoided;
    
    // Calculate coverage area
    if (drones.length > 0) {
        let minX = Infinity, maxX = -Infinity;
        let minZ = Infinity, maxZ = -Infinity;
        
        drones.forEach(drone => {
            minX = Math.min(minX, drone.position.x);
            maxX = Math.max(maxX, drone.position.x);
            minZ = Math.min(minZ, drone.position.z);
            maxZ = Math.max(maxZ, drone.position.z);
        });
        
        const area = ((maxX - minX) * (maxZ - minZ)) / 1000000;
        document.getElementById('coverageArea').textContent = area.toFixed(2) + ' km²';
    }
    
    // Update velocity chart
    if (velocityChart && drones.length > 0) {
        const avgVelocity = drones.reduce((sum, d) => sum + d.velocity.length(), 0) / drones.length;
        
        velocityChart.data.labels.push(simulationState.timeElapsed.toFixed(0) + 's');
        velocityChart.data.datasets[0].data.push(avgVelocity.toFixed(2));
        
        if (velocityChart.data.labels.length > 20) {
            velocityChart.data.labels.shift();
            velocityChart.data.datasets[0].data.shift();
        }
        
        velocityChart.update('none');
    }
    
    // Update position chart
    if (positionChart) {
        positionChart.data.datasets[0].data = drones.map(d => ({
            x: d.position.x.toFixed(1),
            y: d.position.z.toFixed(1)
        }));
        positionChart.update('none');
    }
    
    // Update mission score
    calculateMissionScore();
}

function calculateMissionScore() {
    let score = 0;
    
    // Formation accuracy (30%)
    const formationScore = calculateFormationAccuracy();
    score += formationScore * 30;
    
    // Collision avoidance (30%)
    const collisionScore = 100 - (simulationState.collisionsAvoided * 0.1);
    score += Math.max(0, collisionScore) * 30;
    
    // Communication (20%)
    const commScore = simulationState.signalStrength;
    score += commScore * 20;
    
    // Mission completion (20%)
    const completionScore = Math.min(100, simulationState.timeElapsed * 2);
    score += completionScore * 20;
    
    simulationState.missionScore = Math.round(score / 100);
    
    // Update UI
    document.getElementById('missionScore').textContent = simulationState.missionScore;
    document.getElementById('formationScore').textContent = formationScore.toFixed(0) + '%';
    document.getElementById('collisionScore').textContent = Math.max(0, collisionScore).toFixed(0) + '%';
    document.getElementById('commScore').textContent = commScore + '%';
    document.getElementById('completionScore').textContent = completionScore.toFixed(0) + '%';
}

function calculateFormationAccuracy() {
    if (drones.length < 2) return 100;
    
    const idealSpacing = swarmParams.spacing;
    let totalDeviation = 0;
    let count = 0;
    
    for (let i = 0; i < drones.length; i++) {
        for (let j = i + 1; j < drones.length; j++) {
            const distance = drones[i].position.distanceTo(drones[j].position);
            const deviation = Math.abs(distance - idealSpacing);
            totalDeviation += deviation;
            count++;
        }
    }
    
    const avgDeviation = totalDeviation / count;
    const accuracy = Math.max(0, 100 - (avgDeviation / idealSpacing) * 100);
    
    return accuracy;
}

// ========== EVENT LOG ==========
function logEvent(message, type = 'info') {
    const time = formatTime(simulationState.timeElapsed);
    const event = { time, message, type };
    eventLog.push(event);
    
    const logElement = document.getElementById('eventLog');
    const eventItem = document.createElement('div');
    eventItem.className = `event-item ${type}`;
    eventItem.innerHTML = `
        <span class="event-time">${time}</span>
        <span class="event-message">${message}</span>
    `;
    
    logElement.insertBefore(eventItem, logElement.firstChild);
    
    // Limit log size
    while (logElement.children.length > 50) {
        logElement.removeChild(logElement.lastChild);
    }
}

function clearEventLog() {
    document.getElementById('eventLog').innerHTML = '';
    eventLog.length = 0;
    logEvent('Event log cleared', 'info');
}

function exportEventLog() {
    const data = JSON.stringify(eventLog, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'simulation-log.json';
    a.click();
    logEvent('Event log exported', 'info');
}

// ========== FAILURE SIMULATIONS ==========
function simulateCommFailure() {
    simulationState.signalStrength = Math.max(0, simulationState.signalStrength - 30);
    logEvent('Communication failure simulated - signal strength reduced', 'error');
    
    setTimeout(() => {
        simulationState.signalStrength = Math.min(100, simulationState.signalStrength + 30);
        logEvent('Communication restored', 'info');
    }, 5000);
}

function simulateNodeFailure() {
    if (drones.length > 0) {
        const index = Math.floor(Math.random() * drones.length);
        const drone = drones[index];
        
        if (drone.mesh) {
            scene.remove(drone.mesh);
        }
        
        drones.splice(index, 1);
        simulationState.activeDrones = drones.length;
        
        logEvent(`Node failure: Drone ${index} lost`, 'error');
    }
}

function simulatePacketLoss() {
    swarmParams.commLatency += 200;
    logEvent('Packet loss detected - latency increased', 'warning');
    
    setTimeout(() => {
        swarmParams.commLatency = Math.max(50, swarmParams.commLatency - 200);
        logEvent('Network conditions improved', 'info');
    }, 3000);
}

// ========== UTILITY FUNCTIONS ==========
function startClock() {
    setInterval(() => {
        const time = new Date();
        const hours = String(time.getHours()).padStart(2, '0');
        const minutes = String(time.getMinutes()).padStart(2, '0');
        const seconds = String(time.getSeconds()).padStart(2, '0');
        document.getElementById('timeDisplay').textContent = `${hours}:${minutes}:${seconds}`;
    }, 1000);
}

function formatTime(seconds) {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

let lastTime = Date.now();
let fps = 60;

function updateFPS() {
    const now = Date.now();
    const delta = now - lastTime;
    lastTime = now;
    fps = Math.round(1000 / delta);
    document.getElementById('fpsCounter').textContent = fps;
}

function toggleFullscreen() {
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen();
    } else {
        document.exitFullscreen();
    }
}

function onWindowResize() {
    const canvas = document.getElementById('droneCanvas');
    const container = canvas.parentElement;
    
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

// ========== SYSTEM MESSAGE ==========
setInterval(() => {
    const messages = [
        'System ready for mission deployment',
        'All systems operational',
        'Swarm AI functioning nominally',
        'Virtual communication link stable',
        'Defence training platform online'
    ];
    
    const randomMessage = messages[Math.floor(Math.random() * messages.length)];
    document.getElementById('systemMessage').textContent = randomMessage;
}, 5000);

// Initial system message
document.getElementById('systemMessage').textContent = 'Virtual Swarm Drone Simulator initialized - Ready for training';
