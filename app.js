// Loaded dynamically from data.json via fetch on load

// Standardization: Normalizes Safety Score to 0-100 scale
function getNormalizedSafetyScore(comp) {
    if (comp.sourceType === "이크레더블") {
        return comp.rawSafetyScore;
    } else {
        return comp.rawSafetyScore / 10;
    }
}

// Standardization: Converts normalized score to 1-7 Grade
function getUnifiedGrade(score) {
    if (score >= 95) return "1등급";
    if (score >= 85) return "2등급";
    if (score >= 75) return "3등급";
    if (score >= 65) return "4등급";
    if (score >= 55) return "5등급";
    if (score >= 45) return "6등급";
    return "7등급";
}

// Standardization: Normalizes category scores to 0-100 scale based on rules
function getNormalizedCategoryScores(comp) {
    const norm = {};
    if (comp.sourceType === "이크레더블") {
        norm.management = Math.round((comp.rawScores.management / 35) * 100);
        norm.system = Math.round((comp.rawScores.operation / 40) * 100);
        norm.risk = Math.round((comp.rawScores.investment / 10) * 100);
        norm.performance = Math.round((comp.rawScores.performance / 15) * 100);
    } else {
        norm.management = Math.round((comp.rawScores.control / 150) * 100);
        norm.system = Math.round(((comp.rawScores.feedback + comp.rawScores.education) / 250) * 100);
        norm.risk = Math.round(((comp.rawScores.hazards + comp.rawScores.investment) / 300) * 100);
        norm.performance = Math.round((comp.rawScores.prevention / 300) * 100);
    }
    // Cap at 100
    norm.management = Math.min(norm.management, 100);
    norm.system = Math.min(norm.system, 100);
    norm.risk = Math.min(norm.risk, 100);
    norm.performance = Math.min(norm.performance, 100);
    
    return norm;
}

// Will be loaded dynamically from data.json
let companiesData = [];
let localCompanies = [];

// Chart Instances
let tradeGradeChartInstance = null;
let positioningChart = null;
let radarChart = null;

// DOM Ready
document.addEventListener("DOMContentLoaded", () => {
    // Load local companies
    try {
        localCompanies = JSON.parse(localStorage.getItem("local_companies") || "[]");
    } catch (e) {
        console.error("Failed to parse local_companies from localStorage", e);
        localCompanies = [];
    }

    const processData = (data) => {
        const localIds = new Set(localCompanies.map(c => c.id));
        companiesData = [
            ...localCompanies,
            ...data.filter(c => !localIds.has(c.id))
        ];
        initApp();
        setupThemeToggle();
        setupUploadModal();
    };

    if (window.companiesData && window.companiesData.length > 0) {
        // Load directly from data.js (prevents CORS issues on file:// protocol)
        processData(window.companiesData);
    } else {
        fetch('data.json')
            .then(response => response.json())
            .then(data => {
                processData(data);
            })
            .catch(error => {
                console.error("Error loading company data:", error);
                processData([]);
            });
    }
});

// App Initialization
function initApp() {
    updateOverviewStats();
    populateTradeSelect();
    populateCompanySelect();
    
    // Initial Render of Charts
    renderTradeGradeChart();
    renderPositioningMap("all");
    
    // Select first company by default
    updateDetailedView();

    // Setup Tabs
    setupTabs();

    // Event Listeners
    document.getElementById("trade-filter").addEventListener("change", (e) => {
        const searchText = document.getElementById("company-search").value;
        populateCompanySelect(e.target.value, searchText);
        updateDetailedView();
    });

    document.getElementById("company-search").addEventListener("input", (e) => {
        const tradeFilter = document.getElementById("trade-filter").value;
        populateCompanySelect(tradeFilter, e.target.value);
        updateDetailedView();
    });

    document.getElementById("company-select-1").addEventListener("change", () => {
        updateDetailedView();
    });
}

// Stats Overview Calculator
function updateOverviewStats() {
    const total = companiesData.length;
    const excellent = companiesData.filter(c => ["1등급", "2등급"].includes(getUnifiedGrade(getNormalizedSafetyScore(c)))).length;
    
    const today = new Date("2026-06-10");
    let expiring = 0;
    let expired = 0;

    companiesData.forEach(c => {
        const exp = new Date(c.expiryDate);
        const diffTime = exp - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        if (diffDays < 0) {
            c.status = "만료";
            expired++;
        } else if (diffDays <= 30) {
            c.status = "임박";
            expiring++;
        } else {
            c.status = "정상";
        }
    });

    document.getElementById("total-companies-val").textContent = total;
    document.getElementById("excellent-companies-val").textContent = excellent;
    document.getElementById("expiring-companies-val").textContent = expiring;
    document.getElementById("expired-companies-val").textContent = expired;
}

// Populate Trade Dropdowns
function populateTradeSelect() {
    const filterSelect = document.getElementById("trade-filter");
    
    filterSelect.innerHTML = '<option value="all">전체 공종</option>';
    
    const uniqueTrades = [...new Set(companiesData.map(c => c.trade))];
    uniqueTrades.forEach(t => {
        const option1 = document.createElement("option");
        option1.value = t;
        option1.textContent = t;
        filterSelect.appendChild(option1);
    });
}

// Populate Company Selector Dropdowns
function populateCompanySelect(filterTrade = "all", searchText = "") {
    const select1 = document.getElementById("company-select-1");
    select1.innerHTML = "";
    
    let filtered = filterTrade === "all" 
        ? companiesData 
        : companiesData.filter(c => c.trade === filterTrade);
        
    if (searchText.trim() !== "") {
        const query = searchText.toLowerCase();
        filtered = filtered.filter(c => c.name.toLowerCase().includes(query));
    }
        
    filtered.forEach((c, idx) => {
        const option1 = document.createElement("option");
        option1.value = c.id;
        option1.textContent = c.name;
        if (idx === 0) {
            option1.selected = true;
        }
        select1.appendChild(option1);
    });
}

// Combined Trade Analytics (Grade Distribution Frequency Table)
// Chart 1 & 2 Combined: Trade Analytics (Grade Distribution of Selected Trade)
function renderTradeGradeChart() {
    const ctx = document.getElementById('tradeCombinedChart').getContext('2d');
    
    // Find selected company's trade and safety grade
    const select1 = document.getElementById("company-select-1");
    let selectedTrade = "";
    let selectedGrade = "";
    if (select1 && select1.value) {
        const comp = companiesData.find(c => c.id === select1.value);
        if (comp) {
            selectedTrade = comp.trade;
            selectedGrade = getUnifiedGrade(getNormalizedSafetyScore(comp));
        }
    }
    
    // Fallback if no company selected
    if (!selectedTrade) {
        if (companiesData.length > 0) {
            selectedTrade = companiesData[0].trade;
        } else {
            return;
        }
    }

    // Update Title dynamically
    const titleEl = document.getElementById("trade-combined-title");
    if (titleEl) {
        titleEl.innerHTML = `<i class="fa-solid fa-chart-bar"></i> ${selectedTrade} 안전등급 분포`;
    }

    // Filter companies by this trade
    const tradeComps = companiesData.filter(c => c.trade === selectedTrade);

    // Initialize counts and score lists for grades 1 to 7
    const gradesCount = { "1등급": 0, "2등급": 0, "3등급": 0, "4등급": 0, "5등급": 0, "6등급": 0, "7등급": 0 };
    const gradesScores = { "1등급": [], "2등급": [], "3등급": [], "4등급": [], "5등급": [], "6등급": [], "7등급": [] };
    
    tradeComps.forEach(c => {
        const score = getNormalizedSafetyScore(c);
        const grade = getUnifiedGrade(score);
        if (gradesCount[grade] !== undefined) {
            gradesCount[grade]++;
            gradesScores[grade].push(score);
        }
    });

    // Calculate averages
    const gradesAverages = {};
    Object.keys(gradesScores).forEach(g => {
        const scores = gradesScores[g];
        if (scores.length > 0) {
            const sum = scores.reduce((a, b) => a + b, 0);
            gradesAverages[g] = Math.round((sum / scores.length) * 10) / 10;
        } else {
            gradesAverages[g] = null; // No companies
        }
    });

    const isDark = document.body.classList.contains("dark-theme");
    const textColor = isDark ? '#9ca3af' : '#4b5563';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';

    if (tradeGradeChartInstance) tradeGradeChartInstance.destroy();

    // Inline plugin to draw average score labels inside the bottom of the bars
    const averageLabelsPlugin = {
        id: 'averageLabels',
        afterDatasetsDraw(chart) {
            const { ctx } = chart;
            ctx.save();
            ctx.font = 'bold 9.5px "Outfit", "Noto Sans KR", sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';

            const dataset = chart.data.datasets[0];
            const meta = chart.getDatasetMeta(0);

            meta.data.forEach((bar, index) => {
                const count = dataset.data[index];
                if (count > 0) {
                    const gradeName = chart.data.labels[index];
                    const avg = gradesAverages[gradeName];
                    if (avg !== null) {
                        ctx.fillStyle = '#ffffff';
                        // Draw '평균' and '[avg]점' on separate lines inside the bar
                        ctx.fillText(`평균`, bar.x, bar.base - 18);
                        ctx.fillText(`${avg}점`, bar.x, bar.base - 6);
                    }
                }
            });
            ctx.restore();
        }
    };

    // Color definitions for safety grades
    const baseColors = {
        "1등급": '#3b82f6',
        "2등급": '#10b981',
        "3등급": '#60a5fa',
        "4등급": '#f59e0b',
        "5등급": '#fb923c',
        "6등급": '#ef4444',
        "7등급": '#b91c1c'
    };

    const keys = Object.keys(gradesCount);
    const bgColorsArray = keys.map(g => baseColors[g]);

    // Red dashed outline plugin to encompass the selected grade bar and its X-axis label
    const activeGradeRedBorderPlugin = {
        id: 'activeGradeRedBorder',
        afterDatasetsDraw(chart) {
            if (!selectedGrade) return;
            const { ctx, scales: { x } } = chart;
            const meta = chart.getDatasetMeta(0);
            const index = chart.data.labels.indexOf(selectedGrade);
            
            if (index !== -1) {
                const count = chart.data.datasets[0].data[index];
                const bar = meta.data[index];
                
                // fallback positioning if the bar height is 0 (no companies in that grade)
                const barY = (count > 0 && bar) ? bar.y : x.top;
                const barX = (count > 0 && bar) ? bar.x : x.getPixelForValue(index);
                const barW = (count > 0 && bar) ? bar.width : 45;
                
                // Safely clamp coordinates to remain strictly within the canvas bounds
                const boxTop = Math.max(3, barY - 8);
                const boxBottom = Math.min(chart.height - 3, x.bottom + 4);
                const boxLeft = Math.max(3, barX - barW / 1.3);
                const boxRight = Math.min(chart.width - 3, barX + barW / 1.3);
                const boxWidth = boxRight - boxLeft;
                const boxHeight = boxBottom - boxTop;
                
                ctx.save();
                ctx.strokeStyle = '#dc2626'; // Premium Crimson Red
                ctx.lineWidth = 2.2;
                ctx.setLineDash([5, 4]); // Clean dashed styling
                
                ctx.beginPath();
                if (ctx.roundRect) {
                    ctx.roundRect(boxLeft, boxTop, boxWidth, boxHeight, 6);
                } else {
                    ctx.rect(boxLeft, boxTop, boxWidth, boxHeight);
                }
                ctx.stroke();
                ctx.restore();
            }
        }
    };

    tradeGradeChartInstance = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: keys,
            datasets: [{
                label: '업체 수 (개)',
                data: Object.values(gradesCount),
                backgroundColor: bgColorsArray,
                borderRadius: 4,
                barPercentage: 0.55
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 25,
                    bottom: 15,
                    left: 10,
                    right: 10
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const gradeName = context.label;
                            const count = context.raw;
                            const avg = gradesAverages[gradeName];
                            
                            // Find companies in this trade and grade
                            const matchingComps = tradeComps.filter(c => {
                                const score = getNormalizedSafetyScore(c);
                                return getUnifiedGrade(score) === gradeName;
                            }).sort((a, b) => getNormalizedSafetyScore(b) - getNormalizedSafetyScore(a));

                            const lines = [];
                            lines.push(`업체 수: ${count}개 (평균: ${avg ? avg + '점' : '-'})`);
                            
                            if (matchingComps.length > 0) {
                                lines.push(`-----------------------`);
                                matchingComps.forEach(c => {
                                    const score = getNormalizedSafetyScore(c);
                                    lines.push(`• ${c.name}: ${score}점`);
                                });
                            }
                            return lines;
                        }
                    }
                }
            },
            scales: {
                y: {
                    grid: { color: gridColor },
                    ticks: {
                        color: textColor,
                        stepSize: 1,
                        font: { size: 12, weight: 600 }
                    },
                    beginAtZero: true,
                    title: {
                        display: true,
                        text: '업체 수 (개)',
                        color: textColor,
                        font: { size: 11, weight: 600 }
                    }
                },
                x: {
                    grid: { display: false },
                    ticks: {
                        color: textColor,
                        font: { size: 12, weight: 600 }
                    }
                }
            }
        },
        plugins: [averageLabelsPlugin, activeGradeRedBorderPlugin]
    });
}

// Chart 3: Positioning Map (Scatter Chart - Safety Prevention System vs Execution Performance)
function renderPositioningMap(selectedTrade) {
    const ctx = document.getElementById('positioningMapChart').getContext('2d');
    
    // Filter by selectedTrade
    let filtered = selectedTrade === "all" 
        ? companiesData 
        : companiesData.filter(c => c.trade === selectedTrade);

    // Keep all companies in the positioning map regardless of scores to avoid missing companies

    const scatterData = filtered.map(c => {
        const normScores = getNormalizedCategoryScores(c);
        const preventionSystem = Math.round((normScores.management + normScores.system + normScores.risk) / 3);
        const performance = normScores.performance;
        return {
            x: preventionSystem,
            y: performance,
            label: c.name,
            id: c.id
        };
    });

    // Sort scatterData so that the selected company is rendered last (drawn on top of others)
    const currentSelectedId = document.getElementById("company-select-1")?.value;
    scatterData.sort((a, b) => {
        if (a.id === currentSelectedId) return 1;
        if (b.id === currentSelectedId) return -1;
        return 0;
    });

    // Determine the optimal view limits based on selected company's quadrant to focus the view
    let minX = 0, maxX = 104;
    let minY = 0, maxY = 104;
    if (currentSelectedId) {
        const selectedComp = filtered.find(c => c.id === currentSelectedId);
        if (selectedComp) {
            const normScores = getNormalizedCategoryScores(selectedComp);
            const prevSystem = Math.round((normScores.management + normScores.system + normScores.risk) / 3);
            const perf = normScores.performance;
            
            // Dynamic Zooming based on quadrant of selected company
            if (prevSystem >= 80 && perf >= 80) {
                // Top Right (안전 최우수 파트너)
                minX = 60; maxX = 104;
                minY = 60; maxY = 104;
            } else if (prevSystem < 80 && perf >= 80) {
                // Top Left (성과 우수 / 체계 보완)
                minX = 40; maxX = 90;
                minY = 60; maxY = 104;
            } else if (prevSystem < 80 && perf < 80) {
                // Bottom Left (안전 집중 관리 대상)
                minX = 40; maxX = 90;
                minY = 0; maxY = 90;
            } else {
                // Bottom Right (체계 우수 / 성과 보완)
                minX = 60; maxX = 104;
                minY = 0; maxY = 90;
            }
        }
    }

    const isDark = document.body.classList.contains("dark-theme");
    const textColor = isDark ? '#9ca3af' : '#4b5563';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';

    if (positioningChart) positioningChart.destroy();

    // Custom plugin to draw quadrant backgrounds and dividing lines
    const quadrantPlugin = {
        id: 'quadrantBackgrounds',
        beforeDraw(chart) {
            const {ctx, chartArea: {top, right, bottom, left}, scales: {x, y}} = chart;
            const centerX = x.getPixelForValue(80);
            const centerY = y.getPixelForValue(80);
            
            ctx.save();
            
            const isDarkTheme = document.body.classList.contains("dark-theme");
            
            // Subtly colored quadrant regions
            const colors = isDarkTheme ? {
                topLeft: 'rgba(245, 158, 11, 0.04)',      // 성과 우수 / 체계 보완
                topRight: 'rgba(16, 185, 129, 0.05)',    // 안전 최우수 파트너
                bottomLeft: 'rgba(239, 68, 68, 0.04)',    // 안전 집중 관리 대상
                bottomRight: 'rgba(59, 130, 246, 0.04)'   // 체계 우수 / 성과 보완
            } : {
                topLeft: 'rgba(217, 119, 6, 0.04)',
                topRight: 'rgba(5, 150, 105, 0.05)',
                bottomLeft: 'rgba(220, 38, 38, 0.04)',
                bottomRight: 'rgba(37, 99, 235, 0.04)'
            };
            
            // 1. Top-Left
            ctx.fillStyle = colors.topLeft;
            ctx.fillRect(left, top, centerX - left, centerY - top);
            
            // 2. Top-Right
            ctx.fillStyle = colors.topRight;
            ctx.fillRect(centerX, top, right - centerX, centerY - top);
            
            // 3. Bottom-Left
            ctx.fillStyle = colors.bottomLeft;
            ctx.fillRect(left, centerY, centerX - left, bottom - centerY);
            
            // 4. Bottom-Right
            ctx.fillStyle = colors.bottomRight;
            ctx.fillRect(centerX, centerY, right - centerX, bottom - centerY);
            
            // Draw Dashed Dividing Lines
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = isDarkTheme ? 'rgba(255, 255, 255, 0.25)' : 'rgba(0, 0, 0, 0.15)';
            ctx.setLineDash([5, 5]);
            
            // Vertical center line
            ctx.beginPath();
            ctx.moveTo(centerX, top);
            ctx.lineTo(centerX, bottom);
            ctx.stroke();
            
            // Horizontal center line
            ctx.beginPath();
            ctx.moveTo(left, centerY);
            ctx.lineTo(right, centerY);
            ctx.stroke();
            
            ctx.restore();
        }
    };

    // Custom plugin to draw point labels on the canvas with overlap resolution
    const pointLabelsPlugin = {
        id: 'pointLabels',
        afterDatasetsDraw(chart, args, options) {
            const {ctx, chartArea: {right, left, top, bottom}} = chart;
            ctx.save();
            ctx.font = 'bold 11px "Outfit", "Noto Sans KR", sans-serif';
            ctx.textBaseline = 'middle';
            
            const isDarkTheme = document.body.classList.contains("dark-theme");
            const currentSelectedId = document.getElementById("company-select-1")?.value;
            
            // Collect all labels to draw
            const labelsToDraw = [];
            chart.data.datasets.forEach((dataset, datasetIndex) => {
                const meta = chart.getDatasetMeta(datasetIndex);
                meta.data.forEach((element, index) => {
                    const dataPoint = dataset.data[index];
                    const isSelected = dataPoint.id === currentSelectedId;
                    const fullLabel = dataPoint.label;
                    
                    labelsToDraw.push({
                        id: dataPoint.id,
                        label: fullLabel,
                        x: element.x,
                        y: element.y,
                        isSelected: isSelected,
                        drawX: element.x,
                        drawY: element.y,
                        dir: 'right', // 'right' or 'left' relative to the point
                        padding: isSelected ? 12 : 8
                    });
                });
            });
            
            // Pre-calculate label dimensions and default drawing boxes
            labelsToDraw.forEach(item => {
                if (item.isSelected) {
                    ctx.font = 'bold 11.5px "Outfit", "Noto Sans KR", sans-serif';
                } else {
                    ctx.font = '500 10px "Outfit", "Noto Sans KR", sans-serif';
                }
                const textWidth = ctx.measureText(item.label).width;
                item.width = textWidth;
                
                // Default layout logic:
                // Let's decide default dir: if point is on the far right, dir is 'left', otherwise 'right'
                if (item.x + item.padding + textWidth > right - 5) {
                    item.dir = 'left';
                } else {
                    item.dir = 'right';
                }
                
                // Bounding box dimensions
                item.boxW = textWidth + item.padding;
                item.boxH = 13; // height of label box (reduced slightly to fit more)
            });
            
            // Iterative collision resolution (run multiple passes to resolve chained overlaps)
            for (let pass = 0; pass < 25; pass++) {
                let collisionsResolved = 0;
                for (let i = 0; i < labelsToDraw.length; i++) {
                    for (let j = i + 1; j < labelsToDraw.length; j++) {
                        const a = labelsToDraw[i];
                        const b = labelsToDraw[j];
                        
                        // Bounding boxes coordinates based on dir
                        const aX1 = a.dir === 'left' ? a.x - a.padding - a.width : a.x;
                        const aX2 = aX1 + a.boxW;
                        const aY1 = a.drawY - a.boxH / 2;
                        const aY2 = a.drawY + a.boxH / 2;
                        
                        const bX1 = b.dir === 'left' ? b.x - b.padding - b.width : b.x;
                        const bX2 = bX1 + b.boxW;
                        const bY1 = b.drawY - b.boxH / 2;
                        const bY2 = b.drawY + b.boxH / 2;
                        
                        // Check box overlap
                        const xOverlap = aX1 < bX2 && aX2 > bX1;
                        const yOverlap = aY1 < bY2 && aY2 > bY1;
                        
                        if (xOverlap && yOverlap) {
                            // If they overlap, resolve them.
                            // 1. Try shifting directions first if they have the same direction
                            if (a.dir === b.dir) {
                                if (a.x < b.x) {
                                    a.dir = 'left';
                                    b.dir = 'right';
                                } else if (a.x > b.x) {
                                    a.dir = 'right';
                                    b.dir = 'left';
                                } else {
                                    a.dir = 'left';
                                    b.dir = 'right';
                                }
                                collisionsResolved++;
                                continue;
                            }
                            
                            // 2. Otherwise push them vertically apart
                            const overlapY = Math.min(aY2, bY2) - Math.max(aY1, bY1);
                            const shift = Math.max(overlapY + 2, 7);
                            
                            // Move selected one less, or push apart based on original y
                            if (a.y <= b.y) {
                                a.drawY -= shift / 2;
                                b.drawY += shift / 2;
                            } else {
                                a.drawY += shift / 2;
                                b.drawY -= shift / 2;
                            }
                            
                            // Keep drawY within canvas chartArea vertical bounds during resolution
                            a.drawY = Math.max(top + 8, Math.min(bottom - 8, a.drawY));
                            b.drawY = Math.max(top + 8, Math.min(bottom - 8, b.drawY));
                            collisionsResolved++;
                        }
                    }
                }
                if (collisionsResolved === 0) break;
            }
            
            // Draw all resolved labels
            labelsToDraw.forEach(item => {
                if (item.isSelected) {
                    ctx.fillStyle = '#1d4ed8'; // Dark blue for selected/analyzed company
                    ctx.font = 'bold 11.5px "Outfit", "Noto Sans KR", sans-serif';
                } else {
                    ctx.fillStyle = isDarkTheme ? '#d1d5db' : '#374151';
                    ctx.font = '500 10px "Outfit", "Noto Sans KR", sans-serif';
                }
                
                let textX = item.dir === 'left' 
                    ? item.x - item.padding - item.width 
                    : item.x + item.padding;
                
                // Prevent text truncation on boundaries
                if (textX < left + 5) {
                    textX = left + 5;
                }
                if (textX + item.width > right - 5) {
                    textX = right - 5 - item.width;
                }
                
                ctx.fillText(item.label, textX, item.drawY);
            });
            
            ctx.restore();
        }
    };

    positioningChart = new Chart(ctx, {
        type: 'scatter',
        data: {
            datasets: [{
                label: '협력사 포지션',
                data: scatterData,
                backgroundColor: function(context) {
                    const index = context.dataIndex;
                    const dataPoint = context.dataset.data[index];
                    if (!dataPoint) return '#94a3b8';
                    const currentSelectedId = document.getElementById("company-select-1")?.value;
                    return dataPoint.id === currentSelectedId ? '#1d4ed8' : '#94a3b8';
                },
                borderColor: '#fff',
                borderWidth: function(context) {
                    const index = context.dataIndex;
                    const dataPoint = context.dataset.data[index];
                    if (!dataPoint) return 2;
                    const currentSelectedId = document.getElementById("company-select-1")?.value;
                    return dataPoint.id === currentSelectedId ? 3 : 2;
                },
                pointRadius: function(context) {
                    const index = context.dataIndex;
                    const dataPoint = context.dataset.data[index];
                    if (!dataPoint) return 6;
                    const currentSelectedId = document.getElementById("company-select-1")?.value;
                    return dataPoint.id === currentSelectedId ? 9 : 5.5;
                },
                pointHoverRadius: function(context) {
                    const index = context.dataIndex;
                    const dataPoint = context.dataset.data[index];
                    if (!dataPoint) return 8;
                    const currentSelectedId = document.getElementById("company-select-1")?.value;
                    return dataPoint.id === currentSelectedId ? 11 : 7.5;
                }
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    left: 65,
                    right: 65, // Increased padding to prevent vendor text truncation on both sides
                    top: 15,
                    bottom: 15
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: function(context) {
                            const item = context.raw;
                            return `${item.label} (예방체계: ${item.x}점, 실행성과: ${item.y}점)`;
                        }
                    }
                }
            },
            scales: {
                x: {
                    title: { display: false },
                    grid: { color: gridColor },
                    ticks: { 
                        color: textColor,
                        font: { size: 11, weight: 600 }
                    },
                    min: minX,
                    max: maxX
                },
                y: {
                    title: { display: false },
                    grid: { color: gridColor },
                    ticks: { 
                        color: textColor,
                        font: { size: 11, weight: 600 }
                    },
                    min: minY,
                    max: maxY
                }
            }
        },
        plugins: [quadrantPlugin, pointLabelsPlugin]
    });
}

// Chart 4: Radar Chart comparing selected company and trade average
function renderRadarChartSingle(name, scores, averages) {
    const ctx = document.getElementById('radarCompareChart').getContext('2d');
    
    const isDark = document.body.classList.contains("dark-theme");
    const textColor = isDark ? '#9ca3af' : '#4b5563';
    const gridColor = isDark ? 'rgba(255, 255, 255, 0.12)' : 'rgba(0, 0, 0, 0.08)';
    
    if (radarChart) radarChart.destroy();

    // Inline plugin to draw value labels at each data point with smart offsets to prevent overlaps
    const valueLabelsPlugin = {
        id: 'valueLabels',
        afterDatasetsDraw(chart) {
            const { ctx } = chart;
            ctx.save();
            ctx.font = 'bold 12px "Outfit", "Noto Sans KR", sans-serif';
            ctx.textBaseline = 'middle';
            
            chart.data.datasets.forEach((dataset, datasetIndex) => {
                const meta = chart.getDatasetMeta(datasetIndex);
                meta.data.forEach((element, index) => {
                    const value = dataset.data[index];
                    const { x, y } = element;

                    let targetX = x;
                    let targetY = y;

                    // Set coordinates based on the index (0: Top, 1: Right, 2: Bottom, 3: Left)
                    if (index === 0) { // Top (12 o'clock)
                        ctx.textAlign = datasetIndex === 0 ? 'right' : 'left';
                        targetX += datasetIndex === 0 ? -10 : 10;
                        targetY -= 2;
                    } else if (index === 1) { // Right (3 o'clock)
                        ctx.textAlign = 'center';
                        targetY += datasetIndex === 0 ? -12 : 12;
                    } else if (index === 2) { // Bottom (6 o'clock)
                        ctx.textAlign = datasetIndex === 0 ? 'right' : 'left';
                        targetX += datasetIndex === 0 ? -10 : 10;
                        targetY += 2;
                    } else if (index === 3) { // Left (9 o'clock)
                        ctx.textAlign = 'center';
                        targetY += datasetIndex === 0 ? -12 : 12;
                    }

                    if (datasetIndex === 0) {
                        // Company: vibrant blue
                        ctx.fillStyle = isDark ? '#60a5fa' : '#2563eb';
                    } else {
                        // Trade Average: high-contrast warm orange
                        ctx.fillStyle = isDark ? '#fba54b' : '#d97706';
                    }
                    ctx.fillText(`${value}점`, targetX, targetY);
                });
            });
            ctx.restore();
        }
    };
    
    radarChart = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: [
                ['경영방침', '및 조직'],
                ['안전관리 체계', '및 교육'],
                ['위험성 평가', '및 투자'],
                ['안전 성과', '(재해율)']
            ],
            datasets: [
                {
                    label: name,
                    data: [scores.management, scores.system, scores.risk, scores.performance],
                    backgroundColor: 'rgba(59, 130, 246, 0.25)',
                    borderColor: '#3b82f6',
                    pointBackgroundColor: '#3b82f6',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: '#3b82f6',
                    borderWidth: 2.5
                },
                {
                    label: '공종 평균',
                    data: [averages.management, averages.system, averages.risk, averages.performance],
                    backgroundColor: 'rgba(245, 158, 11, 0.12)',
                    borderColor: '#f59e0b', // High-contrast amber/orange
                    pointBackgroundColor: '#f59e0b',
                    pointBorderColor: '#fff',
                    pointHoverBackgroundColor: '#fff',
                    pointHoverBorderColor: '#f59e0b',
                    borderWidth: 2,
                    borderDash: [5, 5]
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            layout: {
                padding: {
                    top: 15,
                    bottom: 15,
                    left: 35,
                    right: 35
                }
            },
            plugins: {
                legend: {
                    position: 'top',
                    labels: {
                        color: textColor,
                        boxWidth: 14,
                        font: { size: 12, weight: 600 }
                    }
                }
            },
            scales: {
                r: {
                    angleLines: { color: gridColor },
                    grid: { color: gridColor },
                    pointLabels: {
                        color: textColor,
                        padding: 12, // Balanced padding for multi-line labels
                        font: { size: 11.5, weight: 600 }
                    },
                    ticks: {
                        display: false, // Hide vertical axis tick labels to keep it clean and avoid overlaps
                        stepSize: 20
                    },
                    min: 0,
                    max: 100
                }
            }
        },
        plugins: [valueLabelsPlugin]
    });
}

// Helpers for grades and averages
function getGradeColor(grade) {
    const colors = {
        '1등급': '#3b82f6',
        '2등급': '#10b981',
        '3등급': '#60a5fa',
        '4등급': '#f59e0b',
        '5등급': '#fb923c',
        '6등급': '#ef4444',
        '7등급': '#b91c1c'
    };
    return colors[grade] || '#3b82f6';
}

function getTradeAverages(trade) {
    const tradeComps = companiesData.filter(c => c.trade === trade);
    const averages = { management: 0, system: 0, risk: 0, performance: 0 };
    if (tradeComps.length === 0) return averages;

    tradeComps.forEach(tc => {
        const tcScores = getNormalizedCategoryScores(tc);
        averages.management += tcScores.management;
        averages.system += tcScores.system;
        averages.risk += tcScores.risk;
        averages.performance += tcScores.performance;
    });

    averages.management = Math.round(averages.management / tradeComps.length);
    averages.system = Math.round(averages.system / tradeComps.length);
    averages.risk = Math.round(averages.risk / tradeComps.length);
    averages.performance = Math.round(averages.performance / tradeComps.length);
    return averages;
}

// Generate safety insights dynamically based on scores vs averages
function generateSafetyInsights(comp, scores, averages) {
    const weaknesses = [];
    const weaknessesList = [];
    const strengths = [];
    const strengthsList = [];

    // Management
    if (scores.management < averages.management) {
        weaknesses.push(`<strong>경영조직</strong>(평균 대비 -${averages.management - scores.management}점)`);
        weaknessesList.push(`<li><strong>안전보건방침 게시 및 조직 권한 강화:</strong> 대표이사 서명이 담긴 안전보건경영방침을 현장 사무실 초입에 즉시 게시하고 근로자 정기 교육 시 이를 낭독하십시오. 추가로 현장 소장 외 관리감독자 중 1인을 현장 안전담당자로 공식 임명하여 임무와 예산 집행 건의 권한을 문서로 부여하십시오.</li>`);
    } else {
        const diff = scores.management - averages.management;
        strengths.push(`<strong>경영조직</strong>(평균 대비 +${diff}점)`);
        strengthsList.push(`<li><strong>안전보건경영 의지 우수:</strong> 경영진의 안전경영 관심도가 높고 안전보건방침이 체계적으로 관리되고 있으며, 예산 및 조치 권한 체계가 공종 평균 이상으로 우수합니다.</li>`);
    }

    // System
    if (scores.system < averages.system) {
        weaknesses.push(`<strong>안전체계/교육</strong>(평균 대비 -${averages.system - scores.system}점)`);
        weaknessesList.push(`<li><strong>법정 안전교육 이수 및 비상대응 훈련 실체화:</strong> 법정 정기안전보건교육 이수율 100% 달성을 위해 교육 전 출결 확인용 근로자 수기 서명부와 교육 전경 사진 대장을 상시 작성하여 관리하십시오. 연 2회 이상 추락·화재·질식 등 현장 공정에 적합한 비상 시나리오를 수립해 실제 대피 모의 훈련을 실시하고 결과 보고서를 증빙물로 확보하십시오.</li>`);
    } else {
        const diff = scores.system - averages.system;
        strengths.push(`<strong>안전체계/교육</strong>(평균 대비 +${diff}점)`);
        strengthsList.push(`<li><strong>안전 교육 및 모니터링 이행 견고:</strong> 근로자 법정안전교육 이수 관리가 체계적이며, 정기적인 소통과 안전점검 체계가 모범적으로 실행되고 있습니다.</li>`);
    }

    // Risk
    if (scores.risk < averages.risk) {
        weaknesses.push(`<strong>위험평가/투자</strong>(평균 대비 -${averages.risk - scores.risk}점)`);
        weaknessesList.push(`<li><strong>근로자 참여 위험성평가 시행 및 안전예산 증빙 보완:</strong> 매주 작업 개시 전 협력업체 소장과 근로자 대표가 참여하는 '위험성평가 검토 회의'를 개최하고, 아차사고 발굴 일지를 작성하여 보관하십시오. 산업안전보건관리비(안전 장구류 구매, 안전펜스 설치 등) 집행 시 구매 영수증, 세금계산서, 현장 설치 전후 사진을 월별 대장으로 정리하여 명확하게 투자 비용을 증빙하십시오.</li>`);
    } else {
        const diff = scores.risk - averages.risk;
        strengths.push(`<strong>위험평가/투자</strong>(평균 대비 +${diff}점)`);
        strengthsList.push(`<li><strong>선제적 위험 통제 및 충실한 예산 투입:</strong> 작업자 의견 수렴을 통한 일상적 위험 요인 도출 프로세스가 활성화되어 있으며, 안전 예산이 적기에 투명하게 집행되고 있습니다.</li>`);
    }

    // Performance
    if (scores.performance < averages.performance) {
        weaknesses.push(`<strong>안전성과</strong>(평균 대비 -${averages.performance - scores.performance}점)`);
        weaknessesList.push(`<li><strong>일일 TBM 및 부적격 행동 관리 체계화:</strong> 매일 작업 시작 전 10분 동안 실시하는 TBM(Tool Box Meeting) 일지에 당일 작업의 유해위험 요인과 근로자 서명을 누락 없이 관리하십시오. 보호구 미착용 등 안전 수칙 위반자에 대해 3단계 경고장 발부 절차를 운영하고, 지적 사항에 대한 개선 전후 사진 조치 보고 대장을 일일 안전 성과 지표로 축적해 나가십시오.</li>`);
    } else {
        const diff = scores.performance - averages.performance;
        strengths.push(`<strong>안전성과</strong>(평균 대비 +${diff}점)`);
        strengthsList.push(`<li><strong>현장 밀착형 재해 방지 성과 탁월:</strong> 실질적인 무재해 기간 및 성과가 우수하며, 일일 현장 TBM 이행 관리와 불안전 행동 개선 예방 실적이 매우 긍정적입니다.</li>`);
    }

    let html = '';

    // 1. Render Strengths (우수 관리 항목)
    if (strengths.length > 0) {
        html += `
            <div class="insight-block maintenance">
                <h4><i class="fa-solid fa-circle-check" style="color:var(--success)"></i> 공종 평균 대비 우수 항목</h4>
                <p>평균 대비 양호한 성과를 보이고 있는 분야입니다: ${strengths.join(", ")}</p>
                <ul>
                    ${strengthsList.join("")}
                </ul>
            </div>
        `;
    }

    // 2. Render Weaknesses & Action Plan (취약 항목 및 권고안)
    if (weaknesses.length > 0) {
        html += `
            <div class="insight-block vulnerability" style="margin-top: 10px; border-top: 1px dashed var(--card-border); padding-top: 10px;">
                <h4><i class="fa-solid fa-triangle-exclamation"></i> 공종 평균 대비 취약 항목</h4>
                <p>보완이 시급한 지표입니다: ${weaknesses.join(", ")}</p>
            </div>
            <div class="insight-block action-plan">
                <h4><i class="fa-solid fa-hand-holding-hand"></i> 구체적 개선 조치 권고</h4>
                <ul>
                    ${weaknessesList.join("")}
                </ul>
            </div>
        `;
    }

    return html;
}

// Micro View: Detailed Company Safety Performance
function updateDetailedView() {
    const select1 = document.getElementById("company-select-1");
    if (!select1 || !select1.value) {
        // Render Empty state if no company
        document.getElementById("detail-basic-info-card").innerHTML = `<div class="empty-state">선택된 협력업체가 없습니다.</div>`;
        document.getElementById("details-comparison-table").innerHTML = "";
        document.getElementById("detail-insights-container").innerHTML = "";
        return;
    }
    
    const comp1Id = select1.value;
    const comp1 = companiesData.find(c => c.id === comp1Id);
    if (!comp1) return;

    const basicInfoCard = document.getElementById("detail-basic-info-card");
    const statement = document.getElementById("detail-percentile-statement");
    const table = document.getElementById("details-comparison-table");
    const insightsContainer = document.getElementById("detail-insights-container");

    const getAlertHTML = (comp) => {
        const today = new Date("2026-06-10");
        const exp = new Date(comp.expiryDate);
        const diffTime = exp - today;
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        if (diffDays < 0) {
            return `<div class="company-alert-banner danger"><i class="fa-solid fa-triangle-exclamation"></i> <strong>평가 만료됨</strong> (${comp.expiryDate})</div>`;
        } else if (diffDays <= 30) {
            return `<div class="company-alert-banner warning"><i class="fa-solid fa-circle-exclamation"></i> <strong>임박:</strong> ${diffDays}일전 (${comp.expiryDate})</div>`;
        } else {
            return `<div class="company-alert-banner success"><i class="fa-solid fa-circle-check"></i> <strong>정상:</strong> 유효 (~${comp.expiryDate})</div>`;
        }
    };

    const score1 = getNormalizedSafetyScore(comp1);
    const grade1 = getUnifiedGrade(score1);
    const comp1Scores = getNormalizedCategoryScores(comp1);
    const tradeComps = companiesData.filter(c => c.trade === comp1.trade);
    const tradeAverages = getTradeAverages(comp1.trade);

    const rank = [...tradeComps].sort((a, b) => getNormalizedSafetyScore(b) - getNormalizedSafetyScore(a)).findIndex(c => c.id === comp1.id) + 1;
    const percentile = Math.max(1, 100 - Math.round(((tradeComps.length - rank + 0.5) / tradeComps.length) * 100));

    // 1. Render Basic Info
    basicInfoCard.innerHTML = `
        <div class="info-card-header">
            <h3>${comp1.name}</h3>
            <span class="badge grade-badge" style="background-color: ${getGradeColor(grade1)}">${grade1} (${Math.round(score1)}점)</span>
        </div>
        <div class="info-card-body">
            <div class="info-row">
                <span class="info-label">등록 공종</span>
                <span class="info-val">${comp1.trade}</span>
            </div>
            <div class="info-row">
                <span class="info-label">신용 평가</span>
                <span class="info-val"><strong>${comp1.creditGrade}</strong> (${comp1.creditScore}점)</span>
            </div>
            <div class="info-row">
                <span class="info-label">안전 평가사</span>
                <span class="info-val">${comp1.sourceType} (${comp1.sourceGrade})</span>
            </div>
            <div class="info-row">
                <span class="info-label">유효 상태</span>
                <span class="info-val">${getAlertHTML(comp1)}</span>
            </div>
        </div>
    `;

    // 2. Render percentile statement
    statement.innerHTML = `본 업체는 <strong>${comp1.trade}</strong> 등록 업체 ${tradeComps.length}개 중 상위 <strong>${percentile}%</strong>(${rank}위)에 해당합니다.`;

    // 3. Render Table
    table.innerHTML = `
        <thead>
            <tr>
                <th>평가 항목 (통합)</th>
                <th>점수</th>
                <th>공종 평균</th>
                <th>편차</th>
            </tr>
        </thead>
        <tbody>
            <tr>
                <td>경영방침 및 조직</td>
                <td><strong>${comp1Scores.management}점</strong></td>
                <td>${tradeAverages.management}점</td>
                <td>${getDiffSpan(comp1Scores.management, tradeAverages.management)}</td>
            </tr>
            <tr>
                <td>안전관리 체계 및 교육</td>
                <td><strong>${comp1Scores.system}점</strong></td>
                <td>${tradeAverages.system}점</td>
                <td>${getDiffSpan(comp1Scores.system, tradeAverages.system)}</td>
            </tr>
            <tr>
                <td>위험성 평가 및 투자</td>
                <td><strong>${comp1Scores.risk}점</strong></td>
                <td>${tradeAverages.risk}점</td>
                <td>${getDiffSpan(comp1Scores.risk, tradeAverages.risk)}</td>
            </tr>
            <tr>
                <td>안전 성과 (재해율)</td>
                <td><strong>${comp1Scores.performance}점</strong></td>
                <td>${tradeAverages.performance}점</td>
                <td>${getDiffSpan(comp1Scores.performance, tradeAverages.performance)}</td>
            </tr>
        </tbody>
    `;

    // 4. Render Insights
    insightsContainer.innerHTML = generateSafetyInsights(comp1, comp1Scores, tradeAverages);

    // 5. Render Radar Chart
    renderRadarChartSingle(comp1.name, comp1Scores, tradeAverages);

    // 6. Update Positioning Map to highlight selection and zoom dynamically
    if (positioningChart) {
        const data = positioningChart.data.datasets[0].data;
        data.sort((a, b) => {
            if (a.id === comp1Id) return 1;
            if (b.id === comp1Id) return -1;
            return 0;
        });

        // Compute optimal view limits based on newly selected company
        const prevSystem = Math.round((comp1Scores.management + comp1Scores.system + comp1Scores.risk) / 3);
        const perf = comp1Scores.performance;
        
        let minX = 0, maxX = 104;
        let minY = 0, maxY = 104;
        if (prevSystem >= 80 && perf >= 80) {
            minX = 60; maxX = 104;
            minY = 60; maxY = 104;
        } else if (prevSystem < 80 && perf >= 80) {
            minX = 40; maxX = 90;
            minY = 60; maxY = 104;
        } else if (prevSystem < 80 && perf < 80) {
            minX = 40; maxX = 90;
            minY = 0; maxY = 90;
        } else {
            minX = 60; maxX = 104;
            minY = 0; maxY = 90;
        }

        // Apply new limits to scales
        positioningChart.options.scales.x.min = minX;
        positioningChart.options.scales.x.max = maxX;
        positioningChart.options.scales.y.min = minY;
        positioningChart.options.scales.y.max = maxY;

        positioningChart.update();
    }

    // 7. Update Trade Combined Chart dynamically based on the selected company's trade
    renderTradeGradeChart();
}

function getDiffSpan(score, avg) {
    const diff = score - avg;
    if (diff > 0) {
        return `<span class="text-primary" style="font-weight:700;">+${diff}</span>`;
    } else if (diff < 0) {
        return `<span class="text-danger" style="font-weight:700;">${diff}</span>`;
    } else {
        return `<span class="text-muted">0</span>`;
    }
}

// Light / Dark Theme Switcher
function setupThemeToggle() {
    const btn = document.getElementById("theme-toggle");
    btn.addEventListener("click", () => {
        const body = document.body;
        if (body.classList.contains("dark-theme")) {
            body.classList.remove("dark-theme");
            body.classList.add("light-theme");
            btn.innerHTML = '<i class="fa-solid fa-moon"></i>';
        } else {
            body.classList.remove("light-theme");
            body.classList.add("dark-theme");
            btn.innerHTML = '<i class="fa-solid fa-sun"></i>';
        }
        
        // Redraw all charts to update text and grid colors
        renderTradeGradeChart();
        renderPositioningMap("all");
        
        updateDetailedView();
    });
}

// Tab Switcher
function setupTabs() {
    const tabBtns = document.querySelectorAll(".tab-btn");
    const tabContents = document.querySelectorAll(".tab-content");

    tabBtns.forEach(btn => {
        btn.addEventListener("click", () => {
            const targetId = btn.getAttribute("data-tab");

            // Update Active Buttons
            tabBtns.forEach(b => b.classList.remove("active"));
            btn.classList.add("active");

            // Update Content Visibility
            tabContents.forEach(content => {
                if (content.id === targetId) {
                    content.style.display = "block";
                    content.classList.add("active");
                } else {
                    content.style.display = "none";
                    content.classList.remove("active");
                }
            });

            // Redraw charts if switching back to dashboard to ensure proper layout
            if (targetId === "dashboard-tab") {
                setTimeout(() => {
                    renderTradeGradeChart();
                    renderPositioningMap("all");
                    updateDetailedView();
                }, 50);
            }
        });
    });
}

// Setup Upload Modal, PDF Parsing, and JSON Export
function setupUploadModal() {
    const btnOpen = document.getElementById("btn-open-upload");
    const btnClose = document.getElementById("btn-close-modal");
    const overlay = document.getElementById("upload-modal-overlay");
    const dropzone = document.getElementById("pdf-dropzone");
    const fileInput = document.getElementById("pdf-file-input");
    const loading = document.getElementById("upload-loading");
    const form = document.getElementById("new-company-form");
    const btnCancel = document.getElementById("btn-cancel-form");
    const customTradeInput = document.getElementById("form-trade-custom");
    const tradeSelect = document.getElementById("form-trade");
    const downloadJsonBtn = document.getElementById("btn-download-json");

    // Open/Close
    btnOpen.addEventListener("click", () => {
        overlay.style.display = "flex";
        resetDropzone();
    });

    const closeModal = () => {
        overlay.style.display = "none";
    };

    btnClose.addEventListener("click", closeModal);
    btnCancel.addEventListener("click", closeModal);
    overlay.addEventListener("click", (e) => {
        if (e.target === overlay) closeModal();
    });

    // Custom Trade Input toggle
    tradeSelect.addEventListener("change", (e) => {
        if (e.target.value === "기타") {
            customTradeInput.style.display = "block";
            customTradeInput.required = true;
        } else {
            customTradeInput.style.display = "none";
            customTradeInput.required = false;
        }
    });

    // Drag and Drop
    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("dragover");
    });

    dropzone.addEventListener("dragleave", () => {
        dropzone.classList.remove("dragover");
    });

    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("dragover");
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handlePDFFile(files[0]);
        }
    });

    dropzone.addEventListener("click", (e) => {
        if (e.target.tagName !== "INPUT") {
            fileInput.click();
        }
    });

    fileInput.addEventListener("change", (e) => {
        if (e.target.files.length > 0) {
            handlePDFFile(e.target.files[0]);
        }
    });

    function resetDropzone() {
        fileInput.value = "";
        dropzone.style.display = "flex";
        loading.style.display = "none";
        form.style.display = "none";
        form.reset();
        customTradeInput.style.display = "none";
        document.getElementById("parsing-badge-notice").style.display = "none";
    }

    // Handle and read PDF
    function handlePDFFile(file) {
        if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
            alert("PDF 파일만 업로드할 수 있습니다.");
            return;
        }

        // Show loading state
        dropzone.classList.add("loading");
        loading.style.display = "flex";
        form.style.display = "none";

        const fileReader = new FileReader();
        fileReader.onload = function() {
            const typedarray = new Uint8Array(this.result);
            
            // Set pdfjs worker source
            pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            
            pdfjsLib.getDocument(typedarray).promise.then(pdf => {
                let maxPages = pdf.numPages;
                let countPromises = [];
                for (let j = 1; j <= maxPages; j++) {
                    countPromises.push(pdf.getPage(j).then(page => {
                        return page.getTextContent().then(textContent => {
                            return textContent.items.map(item => item.str).join(" ");
                        });
                    }));
                }
                return Promise.all(countPromises).then(texts => {
                    const fullText = texts.join("\n");
                    parsePDFText(fullText, file.name);
                });
            }).catch(err => {
                alert("PDF 파싱 오류: " + err.message);
                resetDropzone();
            });
        };
        fileReader.readAsArrayBuffer(file);
    }

    // Parse extracted text
    function parsePDFText(text, filename) {
        // 1. Identify source type
        const isNice = text.includes("나이스디앤비") || text.includes("NICE") || (text.includes("SA") && !text.includes("이크레더블"));
        const sourceType = isNice ? "나이스디앤비" : "이크레더블";

        // 2. Extract Company Name (e.g. (주)대한건설.pdf -> (주)대한건설)
        let companyName = filename.replace(/\.pdf$/i, "").trim();

        // 3. Score & Grade extraction
        let totalScore = 0.0;
        let sourceGrade = "SH3";
        let expiryDate = "2027-12-31";

        if (sourceType === "이크레더블") {
            // SH Score extraction
            const scoreMatch = text.match(/SH\s+Score\s*(\d+(?:\.\d+)?)/i) || text.match(/Score\s*(\d+(?:\.\d+)?)/i);
            if (scoreMatch) {
                totalScore = parseFloat(scoreMatch[1]);
            } else {
                // search for decimal score
                const decMatch = text.match(/(\d{2}\.\d{1})/);
                if (decMatch) totalScore = parseFloat(decMatch[1]);
            }

            // Grade extraction
            const gradeMatch = text.match(/SH\s*(\d)/i) || text.match(/SH-(\d)/i);
            if (gradeMatch) {
                sourceGrade = "SH" + gradeMatch[1];
            } else {
                if (totalScore >= 95) sourceGrade = "SH1";
                else if (totalScore >= 85) sourceGrade = "SH2";
                else if (totalScore >= 75) sourceGrade = "SH3";
                else if (totalScore >= 65) sourceGrade = "SH4";
                else sourceGrade = "SH5";
            }

            const expiryMatch = text.match(/유효기간\s*(\d{4}\.\d{2}\.\d{2})\s*~\s*(\d{4}\.\d{2}\.\d{2})/);
            if (expiryMatch) {
                expiryDate = expiryMatch[2].replace(/\./g, "-");
            }
        } else {
            // 나이스디앤비
            const scoreMatch = text.match(/SA\d+등급\((\d+)점\)/) || text.match(/(\d{3,4})\s*\/\s*1000/) || text.match(/(\d{3,4})\s*점/);
            if (scoreMatch) {
                totalScore = parseFloat(scoreMatch[1]);
            } else {
                totalScore = 800.0;
            }

            const gradeMatch = text.match(/SA\s*(\d)/i) || text.match(/SA-(\d)/i) || text.match(/SA(\d)등급/);
            if (gradeMatch) {
                sourceGrade = "SA" + gradeMatch[1];
            } else {
                if (totalScore >= 950) sourceGrade = "SA1";
                else if (totalScore >= 850) sourceGrade = "SA2";
                else if (totalScore >= 750) sourceGrade = "SA3";
                else if (totalScore >= 650) sourceGrade = "SA4";
                else sourceGrade = "SA5";
            }

            const expiryMatch = text.match(/유효기간\s*:\s*(\d{4}\.\d{2}\.\d{2})\s*~\s*(\d{4}\.\d{2}\.\d{2})/) || text.match(/(\d{4}\.\d{2}\.\d{2})\s*~\s*(\d{4}\.\d{2}\.\d{2})/);
            if (expiryMatch) {
                expiryDate = expiryMatch[2].replace(/\./g, "-");
            }
        }

        const titleMatch = text.match(/(?:회사명|업체명|상호)\s*:\s*([가-힣a-zA-Z0-9()]+)/);
        if (titleMatch && titleMatch[1]) {
            companyName = titleMatch[1].trim();
        }

        // Show form & Populate parsed data
        dropzone.style.display = "none";
        form.style.display = "block";
        document.getElementById("parsing-badge-notice").style.display = "flex";

        document.getElementById("form-name").value = companyName;
        document.getElementById("form-source-type").value = sourceType;
        document.getElementById("form-source-grade").value = sourceGrade;
        document.getElementById("form-safety-score").value = totalScore;
        document.getElementById("form-expiry-date").value = expiryDate;

        document.getElementById("form-credit-grade").value = "BB";
        document.getElementById("form-credit-score").value = 60;

        const rawScoresContainer = document.getElementById("raw-scores-inputs-container");
        rawScoresContainer.innerHTML = "";

        if (sourceType === "이크레더블") {
            const scoresFound = [...text.matchAll(/(\d+(?:\.\d+)?)\s*\(\s*(\d+)\s*\)/g)];
            let mVal = 30.0, oVal = 30.0, iVal = 8.0, pVal = 12.0;
            if (scoresFound.length >= 4) {
                mVal = parseFloat(scoresFound[0][1]);
                oVal = parseFloat(scoresFound[1][1]);
                iVal = parseFloat(scoresFound[2][1]);
                pVal = parseFloat(scoresFound[3][1]);
            } else {
                const ratio = totalScore / 100;
                mVal = Math.round(ratio * 35 * 10) / 10;
                oVal = Math.round(ratio * 40 * 10) / 10;
                iVal = Math.round(ratio * 10 * 10) / 10;
                pVal = Math.round(ratio * 15 * 10) / 10;
            }
            rawScoresContainer.innerHTML = `
                <input type="hidden" name="raw_management" value="${mVal}">
                <input type="hidden" name="raw_operation" value="${oVal}">
                <input type="hidden" name="raw_investment" value="${iVal}">
                <input type="hidden" name="raw_performance" value="${pVal}">
            `;
        } else {
            const ratio = totalScore / 1000;
            const control = Math.round(ratio * 150);
            const hazards = Math.round(ratio * 150);
            const investment = Math.round(ratio * 150);
            const feedback = Math.round(ratio * 100);
            const prevention = Math.round(ratio * 300);
            const education = Math.round(ratio * 150);

            rawScoresContainer.innerHTML = `
                <input type="hidden" name="raw_control" value="${control}">
                <input type="hidden" name="raw_hazards" value="${hazards}">
                <input type="hidden" name="raw_investment" value="${investment}">
                <input type="hidden" name="raw_feedback" value="${feedback}">
                <input type="hidden" name="raw_prevention" value="${prevention}">
                <input type="hidden" name="raw_education" value="${education}">
            `;
        }
    }

    // Submit handler
    form.addEventListener("submit", (e) => {
        e.preventDefault();

        const name = document.getElementById("form-name").value.trim();
        let trade = document.getElementById("form-trade").value;
        if (trade === "기타") {
            trade = customTradeInput.value.trim();
        }
        const sourceType = document.getElementById("form-source-type").value;
        const sourceGrade = document.getElementById("form-source-grade").value.trim();
        const rawSafetyScore = parseFloat(document.getElementById("form-safety-score").value);
        const expiryDate = document.getElementById("form-expiry-date").value;
        const creditGrade = document.getElementById("form-credit-grade").value.trim();
        const creditScore = parseInt(document.getElementById("form-credit-score").value, 10);

        const id = name.replace(/[^a-zA-Z0-9가-힣]/g, "").toLowerCase() + "_" + Math.floor(Math.random() * 1000);

        const rawScores = {};
        if (sourceType === "이크레더블") {
            rawScores.management = parseFloat(form.querySelector("[name='raw_management']").value);
            rawScores.operation = parseFloat(form.querySelector("[name='raw_operation']").value);
            rawScores.investment = parseFloat(form.querySelector("[name='raw_investment']").value);
            rawScores.performance = parseFloat(form.querySelector("[name='raw_performance']").value);
        } else {
            rawScores.control = parseInt(form.querySelector("[name='raw_control']").value, 10);
            rawScores.hazards = parseInt(form.querySelector("[name='raw_hazards']").value, 10);
            rawScores.investment = parseInt(form.querySelector("[name='raw_investment']").value, 10);
            rawScores.feedback = parseInt(form.querySelector("[name='raw_feedback']").value, 10);
            rawScores.prevention = parseInt(form.querySelector("[name='raw_prevention']").value, 10);
            rawScores.education = parseInt(form.querySelector("[name='raw_education']").value, 10);
        }

        const newCompany = {
            id,
            name,
            trade,
            creditGrade,
            creditScore,
            sourceType,
            sourceGrade,
            rawSafetyScore,
            rawScores,
            expiryDate,
            status: "정상"
        };

        localCompanies.unshift(newCompany);
        localStorage.setItem("local_companies", JSON.stringify(localCompanies));
        companiesData.unshift(newCompany);

        updateOverviewStats();
        populateTradeSelect();
        
        populateCompanySelect("all", "");
        const select1 = document.getElementById("company-select-1");
        select1.value = id;

        renderTradeGradeChart();
        renderPositioningMap("all");
        updateDetailedView();

        closeModal();
        alert(`성공적으로 등록되었습니다: ${name}`);
    });

    // JSON Export
    downloadJsonBtn.addEventListener("click", () => {
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(companiesData, null, 4));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", "data.json");
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
        alert("업데이트된 data.json 파일을 다운로드했습니다. 이 파일을 프로젝트 루트 디렉토리에 덮어쓰면 서버 및 타 장치에서도 유지됩니다.");
    });
}
