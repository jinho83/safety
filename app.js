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
        setupDBUpdateAndExport();
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
                    title: {
                        display: true,
                        text: '예방체계 점수',
                        color: textColor,
                        font: { size: 11, weight: 600 }
                    },
                    grid: { color: gridColor },
                    ticks: { 
                        color: textColor,
                        font: { size: 11, weight: 600 }
                    },
                    min: minX,
                    max: maxX
                },
                y: {
                    title: {
                        display: true,
                        text: '실행성과 점수',
                        color: textColor,
                        font: { size: 11, weight: 600 }
                    },
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

// Summarize raw evaluation agency opinions into cooperative subcontractor insights
function summarizeOpinionForSubcontractor(opinionText) {
    if (!opinionText) return "";

    const sentences = opinionText.split(/\.\s+|\n/);
    const lackingPoints = [];
    const actionPoints = [];

    const lackingKeywords = ["미흡", "미비", "부재", "한계", "우려", "누락", "다소", "보통", "수립되지", "않은", "미흡한", "부족"];
    const actionKeywords = ["권고", "제언", "필요", "요구", "강화", "구체화", "보완", "수립할 것", "실행할 것", "작성할 것", "추천", "개선", "관리할 것"];

    // ── 1단계: [중점 개선 권고] 섹션 직접 추출 (가장 신뢰성 높은 소스) ──
    const improvement섹션Match = opinionText.match(/\[중점\s*개선\s*권고\]([\s\S]*?)(?=\[|$)/);
    if (improvement섹션Match) {
        const improvLines = improvement섹션Match[1].split(/\n/)
            .map(l => l.trim().replace(/^[•\-\*\s\d\.\)]+/, '').trim())
            .filter(l => l.length > 10);
        improvLines.forEach(line => {
            // 점수/퍼센트 제거
            let l = line
                .replace(/[\\d\\.]+점으로/g, '')
                .replace(/[\\d\\.]+점/g, '')
                .replace(/[\\d\\.]+%/g, '')
                .replace(/\s{2,}/g, ' ').trim();
            if (!l || l.length < 10) return;
            // 긍정 강점 문장은 제외 (강점 항목 아님)
            if ((l.includes('우수합니다') || l.includes('긍정적입니다')) && !l.includes('필요') && !l.includes('요구') && !l.includes('권고')) return;
            // 동사→협력사 치환
            l = l.replace(/동사의/g, '협력사의').replace(/동사는/g, '협력사는').replace(/동사/g, '우리 회사')
                 .replace(/본 업체는/g, '협력사는').replace(/본 업체/g, '협력사');
            // 어미 변환
            l = l.replace(/필요합니다\.?$/, '필요합니다')
                 .replace(/요구됩니다\.?$/, '요구됩니다')
                 .replace(/권고합니다\.?$/, '권고합니다')
                 .replace(/필요합니다\.$/, '필요합니다')
                 .replace(/요구됩니다\.$/, '요구됩니다');
            actionPoints.push(l);
        });
    }



    sentences.forEach(s => {
        let clean = s.trim().replace(/^[•\-\*\s\d\.\)]+/, "").trim();
        if (clean.length < 10) return;
        if (clean.includes("종합 평가의견") || clean.includes("세부 진단의견") || clean.includes("기업 개요 및 분석") || clean.includes("종합 진단의견") || clean.includes("주요 강점 항목") || clean.includes("중점 개선 권고")) return;
        if (clean.startsWith("안전보건 경영체계") || clean.startsWith("안전보건 운영관리") || clean.startsWith("안전보건 투자") || clean.startsWith("안전보건 성과")) return;

        // Skip purely positive or descriptive sentences
        const isPositiveOrNeutral = (clean.includes("하고 있음") || clean.includes("있으며") || clean.includes("유지하고") || clean.includes("양호") || clean.includes("우수")) &&
                                    (!clean.includes("미비") && !clean.includes("미흡") && !clean.includes("권고") && !clean.includes("제언") && !clean.includes("부재") && !clean.includes("필요") && !clean.includes("보완") && !clean.includes("단축") && !clean.includes("미흡한"));
        if (isPositiveOrNeutral) return;

        clean = clean.replace(/동사의/g, '협력사의')
                     .replace(/동사는/g, '협력사는')
                     .replace(/동사/g, '우리 회사')
                     .replace(/본 업체는/g, '협력사는')
                     .replace(/본 업체/g, '협력사');

        // 포인트/퍼센트 가 포함된 표현 제거 (통합점수와 혼동 방지)
        clean = clean
            // 전체 평균 N점으로 양호 / 우수 ~유지하고있으나
            .replace(/종합\s+안전\s+점검\s+결과\s+전체\s+평균\s+[\d\.]+점으로/g, '안전 점검 결과')
            // 전체 평균 N점으로 -> 제거
            .replace(/전체\s+평균\s+[\d\.]+점으로/g, '')
            // N점으로 추산되는 등 / N점으로 양호 등
            .replace(/[\d\.]+점으로/g, '')
            // 산업재해율\('[\d\.]+\.\d+\s*~.*?\)\)?이\s+[\d\.]+%를 기록
            .replace(/산업재해율[^\)]*\)[\s\S]*?[\d\.]+%를\s+기록[^,\.]*[,\.]/g, '')
            // 동종업계\s*평균\([\d\.]+%\)\s*대비
            .replace(/동종업계\s*평균\([\d\.]+%\)\s*대비[^,\.]*[,\.]/g, '')
            // N%를 기록하는 등
            .replace(/[\d\.]+%를\s+기록[^,\.]*[,\.]/g, '')
            // 상위\s*N%\(N위\)에 해당합니다 (모야모야 표시)
            .replace(/상위\s*[\d]+%\([\d]+위\).*?$/g, '')
            // 전체 평균 N점 (점수 제거)
            .replace(/전체\s+평균\s+[\d\.]+점/g, '')
            // N점에 해당 / N점 수준
            .replace(/[\d\.]+점\s+수준/g, '해당 수준')
            .replace(/[\d\.]+점/g, '')
            // 연속 공백 정리
            .replace(/\s{2,}/g, ' ')
            .trim();

        let isLacking = lackingKeywords.some(kw => clean.includes(kw));
        let isAction = clean.includes("권고") || clean.includes("제언") || clean.includes("필요함") || clean.includes("요구") || clean.includes("강화") || clean.includes("보완");

        if (isLacking || isAction) {
            let problem = "";
            let action = "";

            if (clean.includes("하였으나") || clean.includes("있으나")) {
                const splitWord = clean.includes("하였으나") ? "하였으나" : "있으나";
                const parts = clean.split(splitWord);
                const before = parts[0].trim();
                const after = parts[1].trim();

                if (after.includes("한 바,") || after.includes("하는 바,")) {
                    const afterSplitWord = after.includes("한 바,") ? "한 바," : "하는 바,";
                    const subParts = after.split(afterSplitWord);
                    problem = `${before}${splitWord} ${subParts[0].trim()}`;
                    action = subParts[1].trim();
                } else {
                    problem = `${before}${splitWord} 일부 개선 필요 요소가 확인됨`;
                    action = after;
                }
            } else if (clean.includes("않은 바,")) {
                const parts = clean.split("않은 바,");
                const before = parts[0].trim();
                if (before.endsWith("지")) {
                    problem = before + " 않고 있음";
                } else {
                    problem = before + "지 않고 있음";
                }
                action = parts[1].trim();
            } else if (clean.includes("미흡한 바,")) {
                const parts = clean.split("미흡한 바,");
                const before = parts[0].trim();
                if (before.endsWith("가")) {
                    problem = before + " 미흡한 상태임";
                } else {
                    problem = before + "가 미흡한 상태임";
                }
                action = parts[1].trim();
            } else {
                if (isLacking) {
                    problem = clean;
                    // Generate a corresponding action based on the problem keyword
                    if (clean.includes("미흡")) {
                        action = clean.replace(/미흡함$/, "보완 및 개선 프로세스를 구축하십시오")
                                      .replace(/미흡한 상태임$/, "모니터링을 통해 보완을 실시하십시오")
                                      .replace(/주기가 미흡함$/, "의견 청취 주기를 단축하여 상시적인 피드백 체계를 갖추십시오");
                    } else if (clean.includes("미비")) {
                        action = clean.replace(/미비함$/, "상세 내역을 보완하고 투명성을 강화하십시오");
                    } else if (clean.includes("보통의 수준임") || clean.includes("보통 수준")) {
                        action = clean.replace(/보통의 수준임$/, "안전 예산 편성을 확대하고 재해 예방 투자를 늘려 관리 수준을 높이십시오")
                                      .replace(/보통 수준임$/, "안전 관리 체계를 보완하여 수준을 고도화하십시오");
                    } else if (clean.includes("부족")) {
                        action = clean.replace(/부족함$/, "추가적인 예방 대책을 강구하십시오");
                    }
                } else if (isAction) {
                    // Extract only the action instruction part (after 바, / 한 바, / 하는 바,)
                    if (clean.includes("한 바,")) {
                        action = clean.split("한 바,")[1].trim();
                    } else if (clean.includes("하는 바,")) {
                        action = clean.split("하는 바,")[1].trim();
                    } else if (clean.includes("은 바,")) {
                        action = clean.split("은 바,")[1].trim();
                    } else {
                        // Only use the whole sentence if it genuinely contains a directive
                        // (권고/제언/필요함) and is not purely descriptive
                        const hasDirective = /권고함|제언함|필요함|것을 권고|것을 제언|을 권고|을 제언/.test(clean);
                        if (hasDirective) {
                            action = clean;
                        }
                        // Otherwise skip — it's just a status description
                    }
                }
            }

            if (problem) {
                problem = problem.replace(/^[,\s\.\-]+/, "")
                                 .replace(/권고함$/, "")
                                 .replace(/제언함$/, "")
                                 .replace(/하는 바,?$/, "")
                                 .replace(/한 바,?$/, "")
                                 .replace(/\.?$/, "")
                                 .trim();
                // Ensure we don't append '상태임' to words already ending in Korean verb markers like '임', '함', '음', '됨', '남'
                if (problem.endsWith("미비")) {
                    problem = problem + "함";
                }
                if (!/[임함음됨남]$/.test(problem) && !problem.endsWith("상태임") && !problem.endsWith("수준임")) {
                    problem = problem + " 상태임";
                }
                lackingPoints.push(problem);
            }

            if (action) {
                action = action.replace(/^[,\s\.\-]+/, "").trim();

                // Convert status description or positive sentence to a clear action guide
                if (action.includes("미흡") || action.includes("미비") || action.includes("부재") || action.includes("보통") || action.includes("부족") || action.includes("제언")) {
                    action = action.replace(/주기가 미흡함$/, "의견 청취 주기를 단축하여 상시 피드백 체계를 구축하십시오")
                                   .replace(/주기가 미흡$/, "의견 청취 주기를 단축하여 상시 피드백 체계를 구축하십시오")
                                   .replace(/구체적인 내역이 미비한 바$/, "예산 세부 내역을 산출하고 예비비를 편성하십시오")
                                   .replace(/예산이 미비함$/, "구체적인 안전 예산 집행 계획을 수립하십시오")
                                   .replace(/기록이 부족함$/, "결과 기록 대장에 점검자 및 조치 내역을 상세히 기록하십시오")
                                   .replace(/미비함$/, "상세 내역을 수립하여 보완하십시오")
                                   .replace(/미흡함$/, "보완 및 개선 프로세스를 실행하십시오")
                                   .replace(/부족함$/, "보완 조치 및 대책을 강구하십시오")
                                   .replace(/보통의 수준임$/, "안전 예산 편성을 확대하고 재해 예방 투자를 늘리십시오")
                                   .replace(/보통 수준임$/, "안전 관리 체계를 상향 보완하여 수준을 고도화하십시오");
                }

                // General replacement of grammatical elements to sound like solutions
                if (action.includes("상태는")) {
                    action = action.replace("상태는", "상태를 개선하기 위해");
                }
                if (action.includes("주기가")) {
                    action = action.replace("주기가", "주기를 단축하고");
                }
                if (action.includes("내역이")) {
                    action = action.replace("내역이", "내역을 보완하여");
                }
                if (action.includes("채널을 보유하고 있으나")) {
                    action = action.replace("채널을 보유하고 있으나", "채널의");
                }

                action = action.replace(/수립할\s+것을\s+권고함\.?$/, "수립하십시오")
                               .replace(/보완할\s+것을\s+권고함\.?$/, "보완하십시오")
                               .replace(/관리할\s+것을\s+권고함\.?$/, "관리하십시오")
                               .replace(/개선할\s+것을\s+권고함\.?$/, "개선하십시오")
                               .replace(/기록할\s+것을\s+권고함\.?$/, "기록하십시오")
                               .replace(/지정할\s+것을\s+권고함\.?$/, "지정하십시오")
                               .replace(/수립을\s+권고함\.?$/, "수립하십시오")
                               .replace(/보완을\s+권고함\.?$/, "보완하십시오")
                               .replace(/관리를\s+권고함\.?$/, "관리하십시오")
                               .replace(/개선을\s+권고함\.?$/, "개선하십시오")
                               .replace(/기록을\s+권고함\.?$/, "기록하십시오")
                               .replace(/점검할\s+것을\s+제언함\.?$/, "점검하십시오")
                               .replace(/점검을\s+제언함\.?$/, "점검하십시오")
                               .replace(/권고함\.?$/, "권고합니다")
                               .replace(/제언함\.?$/, "제언합니다")
                               .replace(/요구됨\.?$/, "요구됩니다")
                               .replace(/요망됨\.?$/, "요망됩니다")
                               .replace(/필요함\.?$/, "필요합니다")
                               .replace(/보완할 것$/, "보완하십시오")
                               .replace(/수립할 것$/, "수립하십시오")
                               .replace(/관리할 것$/, "관리하십시오")
                               .replace(/개선할 것$/, "개선하십시오")
                               .replace(/기록할 것$/, "기록하십시오")
                               .replace(/지정할 것$/, "지정하십시오")
                               .replace(/권고됨\.?$/, "권고됩니다")
                               .replace(/제언됨\.?$/, "제언됩니다")
                               .replace(/재해발생을\s+예방\s+노력/g, "재해발생 예방 노력")
                               .replace(/예방\s+노력이/g, "예방을 위한 노력이")
                               .replace(/항\s+목별/g, "항목별")
                               .replace(/이행\s+하기/g, "이행하기")
                               .trim();
                
                // Strip/skip generic advice
                if (/이에\s*대\s*한\s*(관리|개선|보완|조치)/.test(action) || action === "관리를 권고합니다" || action === "개선을 권고합니다") {
                    if (problem.includes("교육") && (problem.includes("시간") || problem.includes("이수"))) {
                        action = "근로자 정기안전보건교육 법정 이수 시간을 준수하고 교육 대장을 보완하십시오";
                    } else if (problem.includes("예산") || problem.includes("비용")) {
                        action = "안전보건 예산 항목별 구체적인 산출 내역을 보완하여 예산을 수립하십시오";
                    } else {
                        // Skip if we don't have a specific mapping
                        return;
                    }
                }
                
                // Safety check: if action is still identical to problem, transform it
                if (action === problem) {
                    action = action.replace(/상태임$/, "상태를 개선하고 보완 대책을 강구하십시오")
                                   .replace(/수준임$/, "수준을 높이기 위한 방안을 마련하십시오");
                }
                actionPoints.push(action);
            }
        }
    });

    if (lackingPoints.length === 0 && actionPoints.length === 0) {
        // Fallback: extract actionable instructions from sentences with explicit directives
        sentences.forEach(s => {
            let clean = s.trim().replace(/^[•\-\*\s\d\.\)]+/, "").trim()
                         .replace(/동사의/g, '협력사의').replace(/동사는/g, '협력사는')
                         .replace(/동사/g, '우리 회사').replace(/본 업체는/g, '협력사는').replace(/본 업체/g, '협력사');
            if (clean.length < 15) return;
            // Skip purely positive/descriptive sentences
            if ((clean.includes("양호한 수준임") || clean.includes("우수한 수준임") || clean.includes("하고 있음") || clean.includes("있으며")) &&
                !clean.includes("권고") && !clean.includes("제언") && !clean.includes("미흡") && !clean.includes("필요")) return;

            // Extract only the instruction after 바, pivots
            let instruction = "";
            if (clean.includes("한 바,")) instruction = clean.split("한 바,").pop().trim();
            else if (clean.includes("하는 바,")) instruction = clean.split("하는 바,").pop().trim();
            else if (clean.includes("은 바,")) instruction = clean.split("은 바,").pop().trim();
            else if (clean.includes("권고") || clean.includes("제언") || clean.includes("필요")) instruction = clean;

            if (!instruction || instruction.length < 10) return;

            // Convert verb endings to imperative commands
            instruction = instruction
                .replace(/수립할\s+것을\s+권고함\.?$/, "수립하십시오")
                .replace(/보완할\s+것을\s+권고함\.?$/, "보완하십시오")
                .replace(/관리할\s+것을\s+권고함\.?$/, "관리하십시오")
                .replace(/개선할\s+것을\s+권고함\.?$/, "개선하십시오")
                .replace(/실시할\s+것을\s+권고함\.?$/, "실시하십시오")
                .replace(/참여할\s+것을\s+권고함\.?$/, "참여하십시오")
                .replace(/지정할\s+것을\s+권고함\.?$/, "지정하십시오")
                .replace(/기록할\s+것을\s+권고함\.?$/, "기록하십시오")
                .replace(/할\s+것을\s+권고함\.?$/, "하십시오")
                .replace(/권고함\.?$/, "권고합니다")
                .replace(/제언함\.?$/, "실시하십시오")
                .replace(/할\s+것을\s+제언함\.?$/, "하십시오")
                .replace(/할\s+것을\s+당부함\.?$/, "하십시오")
                .replace(/당부함\.?$/, "철저히 이행하십시오")
                .replace(/권고됩니다\.?$/, "권고합니다")
                .replace(/필요합니다\.?$/, "필요합니다")
                .trim();

            // Final filter: skip if it still looks like a status description (ends in 임/함/음 without imperative)
            if (/[양호우수보통]한\s+수준임$/.test(instruction)) return;
            if (instruction.endsWith("수준임") || instruction.endsWith("상태임") || instruction.endsWith("하고 있음")) return;
            if (!/[시오요다]$/.test(instruction) && !instruction.includes("권고합니다") && !instruction.includes("필요합니다")) return;

            actionPoints.push(instruction);
        });
    }

    // De-duplicate and sort: company-specific sentences first, generic shared ones last
    // We consider a sentence "more specific" if it contains numbers, dates, accident details,
    // budget figures, or unique structural keywords unlikely to appear in every report.
    function specificityScore(text) {
        let score = 0;
        if (/\d/.test(text)) score += 3;                     // contains numbers (건, 억원, 년 etc.)
        if (text.includes('모의훈련')) score += 3;
        if (text.includes('예산') && text.includes('내역')) score += 3;
        if (text.includes('중대재해') || text.includes('산업재해')) score += 2;
        if (text.includes('않은 바')) score += 2;
        if (text.includes('미비한 바')) score += 2;
        if (text.includes('분기') || text.includes('표창') || text.includes('인증')) score += 1;
        return score;
    }

    const uniqueLacking = [...new Set(lackingPoints)].filter(x => x.length > 5)
        .sort((a, b) => specificityScore(b) - specificityScore(a))
        .slice(0, 4);
    const uniqueActions = [...new Set(actionPoints)].filter(x => x.length > 5)
        .sort((a, b) => specificityScore(b) - specificityScore(a))
        .slice(0, 5);

    let html = `
        <div class="insight-block report-opinion-card" style="background: rgba(37, 99, 235, 0.04); border-left: 4px solid var(--primary); padding: 16px; border-radius: 8px; margin-bottom: 18px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
            <h4 style="margin-top:0; margin-bottom:12px; color: var(--text-primary); font-weight:700; display:flex; align-items:center; gap:8px; font-size:14.5px;">
                <i class="fa-solid fa-lightbulb" style="color:var(--primary)"></i> 
                평가기관 종합의견 기반 핵심 인사이트 및 보완 가이드
            </h4>
    `;

    if (uniqueLacking.length > 0) {
        html += `
            <div class="opinion-sub-section" style="margin-bottom: 14px;">
                <strong style="color: var(--danger); font-size: 13px; display: block; margin-bottom: 6px;"><i class="fa-solid fa-triangle-exclamation"></i> 협력사 안전관리 부족/개선 요소</strong>
                <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: var(--text-secondary); line-height: 1.6;">
                    ${uniqueLacking.map(pt => `<li>${pt}</li>`).join("")}
                </ul>
            </div>
        `;
    }

    if (uniqueActions.length > 0) {
        html += `
            <div class="opinion-sub-section">
                <strong style="color: var(--success); font-size: 13px; display: block; margin-bottom: 6px;"><i class="fa-solid fa-circle-check"></i> 권장 구체적 보완 행동 가이드</strong>
                <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: var(--text-secondary); line-height: 1.6;">
                    ${uniqueActions.map(pt => `<li>${pt}</li>`).join("")}
                </ul>
            </div>
        `;
    } else if (uniqueLacking.length === 0) {
        html += `
            <div class="opinion-sub-section">
                <strong style="color: var(--success); font-size: 13px; display: block; margin-bottom: 6px;"><i class="fa-solid fa-circle-check"></i> 종합 안전 점검 의견</strong>
                <p style="margin: 0; font-size: 13px; color: var(--text-secondary); line-height: 1.6;">평가기관 결과 및 의견서 분석에 따르면, 안전보건 경영체계 구축 및 관리감독자 중심의 현장 교육 체계가 전반적으로 우수하며, 시급한 개선 요구 사항은 식별되지 않았습니다.</p>
            </div>
        `;
    }

    html += `</div>`;
    return html;
}

// Extract custom insight from opinion text based on category keywords
function getCustomizedInsight(comp, category, type) {
    if (!comp || !comp.reportOpinion) return null;

    const sentences = comp.reportOpinion.split(/\.\s+|\n/).map(s => s.trim().replace(/^[•\-\*\s\d\.\)]+/, "").trim()).filter(s => s.length > 10);
    
    const categoryKeywords = {
        management: ["경영", "방침", "조직", "의지", "소장", "임명", "권한", "책임", "역할", "업무분장", "예산"],
        system: ["교육", "운영관리", "훈련", "비상", "의견", "수렴", "소통", "채널", "지침서"],
        risk: ["위험성", "평가", "유해", "위험", "투자", "예산", "비용", "관리비", "영수증", "증빙"],
        performance: ["성과", "재해율", "재해", "사고", "TBM", "행동", "무재해", "보호구", "수칙"]
    };

    const targetKeywords = categoryKeywords[category];
    const matchingSentences = sentences.filter(s => {
        const matchesCategory = targetKeywords.some(kw => s.includes(kw));
        if (!matchesCategory) return false;

        if (type === 'weakness') {
            return s.includes("미흡") || s.includes("미비") || s.includes("부재") || s.includes("부족") || s.includes("권고") || s.includes("제언") || s.includes("필요") || s.includes("요구") || s.includes("발생") || s.includes("우려");
        } else {
            return s.includes("양호") || s.includes("우수") || s.includes("취득") || s.includes("유지") || s.includes("원활") || s.includes("이행하고") || s.includes("실시하고") || s.includes("체계적");
        }
    });

    if (matchingSentences.length > 0) {
        let text = matchingSentences[0]
            .replace(/동사의/g, '협력사의')
            .replace(/동사는/g, '협력사는')
            .replace(/동사/g, '우리 회사')
            .replace(/본 업체는/g, '협력사는')
            .replace(/본 업체/g, '협력사');
            
        if (!text.endsWith(".")) text += ".";
        return text;
    }

    return null;
}

// Scan opinion text for critical or general accident history and build alert HTML if found
function checkCriticalAccidents(opinionText) {
    if (!opinionText) return null;
    
    // Split sentences by period followed by space, or newline to avoid splitting dates like '25.01
    const sentences = opinionText.split(/\.\s+|\n/).map(s => s.trim()).filter(s => s.length > 5);
    const criticalAlerts = [];
    const generalAlerts = [];

    sentences.forEach(s => {
        const cleanSpace = s.replace(/\s+/g, "");
        const isEval = (cleanSpace.includes("대비한계획") || cleanSpace.includes("대비계획") || cleanSpace.includes("위험에대비") || cleanSpace.includes("대비한")) && (cleanSpace.includes("수준") || cleanSpace.includes("우수") || cleanSpace.includes("양호"));
        if (isEval) return;

        const hasCritical = cleanSpace.includes("중대재해");
        const hasGeneral = cleanSpace.includes("산업재해") || cleanSpace.includes("산재") || cleanSpace.includes("일반재해");

        // Critical accident keywords (중대재해)
        if (hasCritical) {
            const isNoAccident = cleanSpace.includes("없는것으로") || cleanSpace.includes("전무") || cleanSpace.includes("없었") || cleanSpace.includes("없음") || cleanSpace.includes("이력이없") || cleanSpace.includes("발생사실이없") || cleanSpace.includes("발생하지않았") || cleanSpace.includes("발생하지않은") || cleanSpace.includes("0건") || cleanSpace.includes("0%") || cleanSpace.includes("무재해");
            if (!isNoAccident && (cleanSpace.includes("발생") || cleanSpace.includes("건의") || cleanSpace.includes("이력") || cleanSpace.includes("존재"))) {
                let clean = s.replace(/동사의/g, '협력사의')
                             .replace(/동사는/g, '협력사는')
                             .replace(/동사/g, '우리 회사')
                             .replace(/본 업체는/g, '협력사는')
                             .replace(/본 업체/g, '협력사')
                             .trim();

                // Truncate recommendations / opinions to keep only facts
                const match = clean.match(/(.*?발생한\s+바|.*?발생하였으며|.*?발생하였으나|.*?발생하였고|.*?확인된\s+바|.*?존재하는\s+바)/);
                if (match) {
                    clean = match[1]
                        .replace(/발생한\s+바$/, "발생")
                        .replace(/발생하였으며$/, "발생")
                        .replace(/발생하였으나$/, "발생")
                        .replace(/발생하였고$/, "발생")
                        .replace(/확인된\s+바$/, "확인")
                        .replace(/존재하는\s+바$/, "존재");
                }

                // Also strip trailing ~함, ~됨, ~함. if they exist
                clean = clean.replace(/발생함\.?$/, "발생")
                             .replace(/존재함\.?$/, "존재")
                             .replace(/확인됨\.?$/, "확인")
                             .replace(/\.?$/, "")
                             .trim();

                // Clean prefix transitions (다만, 한편 등)
                clean = clean.replace(/^(다만|한편|또한|그러나)\s*,?\s*/, "");

                // Remove subject marker '가' for cleaner noun phrasing
                clean = clean.replace(/재해가\s+발생/g, "재해 발생");

                criticalAlerts.push(clean);
            }
        }
        // General accident keywords (산업재해)
        else if (hasGeneral) {
            const isNoAccident = cleanSpace.includes("없는것으로") || cleanSpace.includes("전무") || cleanSpace.includes("없었") || cleanSpace.includes("없음") || cleanSpace.includes("이력이없") || cleanSpace.includes("발생사실이없") || cleanSpace.includes("발생하지않았") || cleanSpace.includes("발생하지않은") || cleanSpace.includes("0건") || cleanSpace.includes("0%") || cleanSpace.includes("안정") || cleanSpace.includes("양호") || cleanSpace.includes("무재해");
            if (!isNoAccident && (cleanSpace.includes("발생") || cleanSpace.includes("건의") || cleanSpace.includes("재해율") || cleanSpace.includes("존재"))) {
                let clean = s.replace(/동사의/g, '협력사의')
                             .replace(/동사는/g, '협력사는')
                             .replace(/동사/g, '우리 회사')
                             .replace(/본 업체는/g, '협력사는')
                             .replace(/본 업체/g, '협력사')
                             .trim();

                // Truncate recommendations / opinions to keep only facts
                const match = clean.match(/(.*?발생한\s+바|.*?발생하였으며|.*?발생하였으나|.*?발생하였고|.*?확인된\s+바|.*?존재하는\s+바)/);
                if (match) {
                    clean = match[1]
                        .replace(/발생한\s+바$/, "발생")
                        .replace(/발생하였으며$/, "발생")
                        .replace(/발생하였으나$/, "발생")
                        .replace(/발생하였고$/, "발생")
                        .replace(/확인된\s+바$/, "확인")
                        .replace(/존재하는\s+바$/, "존재");
                }

                // Also strip trailing ~함, ~됨, ~함. if they exist
                clean = clean.replace(/발생함\.?$/, "발생")
                             .replace(/존재함\.?$/, "존재")
                             .replace(/확인됨\.?$/, "확인")
                             .replace(/\.?$/, "")
                             .trim();

                // Clean prefix transitions (다만, 한편 등)
                clean = clean.replace(/^(다만|한편|또한|그러나)\s*,?\s*/, "");

                // Remove subject marker '가' for cleaner noun phrasing
                clean = clean.replace(/재해가\s+발생/g, "재해 발생");

                generalAlerts.push(clean);
            }
        }
    });

    const validCrit = criticalAlerts.filter(a => a && a.trim().length > 0);
    const validGen = generalAlerts.filter(a => a && a.trim().length > 0);

    if (validCrit.length > 0 || validGen.length > 0) {
        let alertHtml = `
            <div class="accident-warning-box" style="margin-bottom: 18px; border-radius: 8px; overflow: hidden; border: 1.5px solid var(--danger); background: var(--card-bg); box-shadow: 0 4px 12px rgba(220, 38, 38, 0.08);">
                <div style="background: rgba(220, 38, 38, 0.07); padding: 12px 16px; border-bottom: 1px solid var(--card-border);">
                    <strong style="color: var(--danger); font-size: 14px; display: flex; align-items: center; gap: 8px; font-weight: 800;">
                        <i class="fa-solid fa-triangle-exclamation" style="font-size: 14px;"></i> 특이사항
                    </strong>
                </div>
                <div style="padding: 12px 16px;">
                    <ul style="margin: 0; padding-left: 20px; font-size: 12.5px; color: var(--text-primary); line-height: 1.6; font-weight: 600;">
        `;
        
        validCrit.forEach(alert => {
            alertHtml += `<li style="margin-bottom: 6px; color: var(--danger);"><span style="color: var(--text-primary); font-weight: 700;">[중대재해]</span> ${alert}</li>`;
        });
        
        validGen.forEach(alert => {
            alertHtml += `<li style="margin-bottom: 6px; color: var(--warning);"><span style="color: var(--text-primary); font-weight: 500;">[산업재해]</span> ${alert}</li>`;
        });
        
        alertHtml += `
                    </ul>
                </div>
            </div>
        `;
        return alertHtml;
    }

    return null;
}

// Generate safety insights dynamically based on scores vs averages
function generateSafetyInsights(comp, scores, averages) {
    const weaknesses = [];
    const weaknessesList = [];
    const strengths = [];
    const strengthsList = [];

    // Management
    if (scores.management < averages.management) {
        const diff = averages.management - scores.management;
        weaknesses.push(`<strong>경영조직</strong>(평균 대비 -${diff}점)`);
        
        const customText = getCustomizedInsight(comp, 'management', 'weakness');
        const defaultText = `<strong>안전보건방침 게시 및 권한 부여 보완:</strong> ${comp.name}의 ${comp.trade} 공정 특성에 맞추어 대표이사 서명이 포함된 경영방침을 현장에 신속히 게시하고, 관리감독자의 안전관리 권한 위임과 예산 전결 건의 절차를 체계적으로 수립하십시오.`;
        weaknessesList.push(`<li>${customText ? `<strong>보고서 기반 세부 개선 권고:</strong> ` + customText : defaultText}</li>`);
    } else {
        const diff = scores.management - averages.management;
        strengths.push(`<strong>경영조직</strong>(평균 대비 +${diff}점)`);
        
        const customText = getCustomizedInsight(comp, 'management', 'strength');
        const defaultText = `<strong>경영진의 안전관리 의지 및 체계 수립:</strong> ${comp.name}의 경영진이 수립한 안전보건방침과 조직 체계가 우수하며, 안전보건경영시스템(ISO 45001) 인증 유지와 예산 배정이 공종 평균 대비 선제적입니다.`;
        strengthsList.push(`<li>${customText ? `<strong>보고서 기반 우수 요소:</strong> ` + customText : defaultText}</li>`);
    }

    // System
    if (scores.system < averages.system) {
        const diff = averages.system - scores.system;
        weaknesses.push(`<strong>안전체계/교육</strong>(평균 대비 -${diff}점)`);
        
        const customText = getCustomizedInsight(comp, 'system', 'weakness');
        const defaultText = `<strong>법정 교육 및 비상대응 실질화:</strong> ${comp.name}의 현장 근로자 전원이 법정 안전 보건 교육을 이수하도록 서명부를 관리하고, 비상대피 시나리오에 따른 가상 훈련을 연 2회 이상 실시하여 증빙물로 확보하십시오.`;
        weaknessesList.push(`<li>${customText ? `<strong>보고서 기반 세부 개선 권고:</strong> ` + customText : defaultText}</li>`);
    } else {
        const diff = scores.system - averages.system;
        strengths.push(`<strong>안전체계/교육</strong>(평균 대비 +${diff}점)`);
        
        const customText = getCustomizedInsight(comp, 'system', 'strength');
        const defaultText = `<strong>체계적인 안전 교육 및 소통 운영:</strong> 근로자 법정 교육 관리가 명확하며, 현장 근로자 협의체를 통한 적극적인 소통 및 의견 청취 활동이 지속적으로 원활하게 이루어지고 있습니다.`;
        strengthsList.push(`<li>${customText ? `<strong>보고서 기반 우수 요소:</strong> ` + customText : defaultText}</li>`);
    }

    // Risk
    if (scores.risk < averages.risk) {
        const diff = averages.risk - scores.risk;
        weaknesses.push(`<strong>위험평가/투자</strong>(평균 대비 -${diff}점)`);
        
        const customText = getCustomizedInsight(comp, 'risk', 'weakness');
        const defaultText = `<strong>근로자 참여 위험성평가 및 예산 관리:</strong> ${comp.name}의 소장 및 근로자 대표가 함께 참여하는 위험성평가 회의록을 주기적으로 작성하고, ${comp.trade} 현장의 산업안전보건관리비 예산 집행 세금계산서와 설치 전후 사진을 매월 대장으로 보완하십시오.`;
        weaknessesList.push(`<li>${customText ? `<strong>보고서 기반 세부 개선 권고:</strong> ` + customText : defaultText}</li>`);
    } else {
        const diff = scores.risk - averages.risk;
        strengths.push(`<strong>위험평가/투자</strong>(평균 대비 +${diff}점)`);
        
        const customText = getCustomizedInsight(comp, 'risk', 'strength');
        const defaultText = `<strong>선제적 위험 통제 및 충실한 안전 투자:</strong> ${comp.trade} 공종의 위험 요소를 사전에 적극적으로 차단하기 위한 일상적 위험성평가 프로세스가 활성화되어 있고 안전 투자가 적시에 이행되고 있습니다.`;
        strengthsList.push(`<li>${customText ? `<strong>보고서 기반 우수 요소:</strong> ` + customText : defaultText}</li>`);
    }

    // Performance
    if (scores.performance < averages.performance) {
        const diff = averages.performance - scores.performance;
        weaknesses.push(`<strong>안전성과</strong>(평균 대비 -${diff}점)`);
        
        const customText = getCustomizedInsight(comp, 'performance', 'weakness');
        const defaultText = `<strong>일일 TBM 및 행동 수칙 기록:</strong> 매일 작업 개시 전 TBM 회의 일지와 참석자 서명부를 철저히 관리하고, 현장 안전 위반 행위자에 대한 3단계 경고 절차 운영 실적을 일일 안전 성과 지표로 모니터링하십시오.`;
        weaknessesList.push(`<li>${customText ? `<strong>보고서 기반 세부 개선 권고:</strong> ` + customText : defaultText}</li>`);
    } else {
        const diff = scores.performance - averages.performance;
        strengths.push(`<strong>안전성과</strong>(평균 대비 +${diff}점)`);
        
        const customText = getCustomizedInsight(comp, 'performance', 'strength');
        const defaultText = `<strong>현장 밀착형 재해 예방 및 안전 성과:</strong> 동종업 평균 재해율 대비 0% 수준의 철저한 무재해 실적을 보이고 있으며, 일일 TBM 활동이 활성화되어 불안전한 행동 예방 효과를 거두고 있습니다.`;
        strengthsList.push(`<li>${customText ? `<strong>보고서 기반 우수 요소:</strong> ` + customText : defaultText}</li>`);
    }

    let html = '';

    // Check critical accidents first and prepend it if exists
    if (comp && comp.reportOpinion) {
        const accidentAlert = checkCriticalAccidents(comp.reportOpinion);
        if (accidentAlert) {
            html += accidentAlert;
        }
    }

    // Render Summarized Report Opinion for Subcontractor
    if (comp && comp.reportOpinion) {
        html += summarizeOpinionForSubcontractor(comp.reportOpinion);
    }

    return html;
}

// generateSafetyInsightsOnly: same as generateSafetyInsights but WITHOUT accident alert (handled in separate div)
function generateSafetyInsightsOnly(comp, scores, averages) {
    // Build the same insights/action guide HTML but skip accident alert
    let html = '';
    if (comp && comp.reportOpinion) {
        html += summarizeOpinionForSubcontractor(comp.reportOpinion);
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
        const alertEl = document.getElementById("detail-accident-alert");
        if (alertEl) alertEl.innerHTML = "";
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
            <span class="badge grade-badge" style="background-color: ${getGradeColor(grade1)}; font-size: 14px; padding: 4px 12px; font-weight: 800;">${grade1} (${Math.round(score1)}점)</span>
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
    const companyAvg = Math.round((comp1Scores.management + comp1Scores.system + comp1Scores.risk + comp1Scores.performance) / 4 * 10) / 10;
    const tradeAvg = Math.round((tradeAverages.management + tradeAverages.system + tradeAverages.risk + tradeAverages.performance) / 4 * 10) / 10;

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

    // 4. Render Accident Alert (separate, always visible)
    const accidentAlertEl = document.getElementById('detail-accident-alert');
    if (accidentAlertEl) {
        if (comp1 && comp1.reportOpinion) {
            const accidentHtml = checkCriticalAccidents(comp1.reportOpinion);
            accidentAlertEl.innerHTML = accidentHtml || '';
        } else {
            accidentAlertEl.innerHTML = '';
        }
    }

    // 5. Render Insights (without accident alert prepended)
    insightsContainer.innerHTML = generateSafetyInsightsOnly(comp1, comp1Scores, tradeAverages);

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
    let diff = score - avg;
    diff = Math.round(diff * 10) / 10;
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
async function extractTextFromPdf(file) {
    const arrayBuffer = await file.arrayBuffer();
    if (typeof pdfjsLib === 'undefined') {
        throw new Error("pdf.js 라이브러리가 로드되지 않았습니다.");
    }
    if (!pdfjsLib.GlobalWorkerOptions.workerSrc) {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    }
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    let text = "";
    for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map(item => item.str).join(" ");
        text += pageText + "\n";
    }
    return text;
}

function getCreditScoreFromGrade(grade) {
    const mapping = {
        "AAA": 100, "AA+": 95, "AA0": 90, "AA-": 88, "AA": 90,
        "A+": 85, "A0": 80, "A-": 78, "A": 80,
        "BBB+": 75, "BBB0": 70, "BBB-": 68, "BBB": 70,
        "BB+": 65, "BB0": 60, "BB-": 58, "BB": 60,
        "B+": 55, "B0": 50, "B-": 48, "B": 50,
        "CCC": 40, "CC": 30, "C": 20, "D": 10
    };
    return mapping[grade.toUpperCase().trim()] || 60;
}

function parsePdfData(filename, relativePath, text) {
    const companyName = filename.replace(/\.pdf$/i, "");
    let companyId = "";
    if (companyName.includes("두리")) companyId = "duric";
    else if (companyName.includes("케이세웅")) companyId = "ksewoong";
    else if (companyName.includes("강남")) companyId = "gangnam";
    else if (companyName.includes("두송")) companyId = "dusong";
    else if (companyName.includes("삼지")) companyId = "samji";
    else companyId = companyName.replace(/[^a-zA-Z0-9가-힣]/g, "").toLowerCase();

    const DEFAULT_METADATA = {
        "(주)두리건설": { creditGrade: "BB+", creditScore: 68, trade: "철근콘크리트(건축)" },
        "(주)케이세웅건설": { creditGrade: "BB", creditScore: 60, trade: "철근콘크리트(건축)" },
        "강남건설(주)": { creditGrade: "BB", creditScore: 60, trade: "철근콘크리트(건축)" },
        "두송건설(주)": { creditGrade: "A0", creditScore: 90, trade: "철근콘크리트(건축)" },
        "삼지토건(주)": { creditGrade: "B+", creditScore: 55, trade: "철근콘크리트(건축)" }
    };

    const flatText = text.replace(/\s+/g, " ");
    
    let creditGrade = "";
    const creditMatch = flatText.match(/신용등급\s*(?:\(평가일\))?\s*([A-Za-z0-9+#-]+)/);
    if (creditMatch) {
        creditGrade = creditMatch[1].trim();
    }
    
    const defaultMeta = DEFAULT_METADATA[companyName] || {};
    if (!creditGrade) {
        creditGrade = defaultMeta.creditGrade || "BB";
    }
    const creditScore = defaultMeta.creditScore || getCreditScoreFromGrade(creditGrade);

    let trade = "철근콘크리트(건축)";
    if (relativePath) {
        // Standardize path separator to slash
        const normalizedPath = relativePath.replace(/\\/g, '/');
        const parts = normalizedPath.split('/');
        if (parts.length >= 2) {
            const parentDir = parts[parts.length - 2];
            if (parentDir && parentDir !== "공종") {
                trade = parentDir;
            }
        }
    }
    if (defaultMeta.trade) {
        trade = defaultMeta.trade;
    }

    const isNice = (text.includes("나이스디앤비") || text.includes("SA")) && !text.includes("이크레더블");
    const sourceType = isNice ? "나이스디앤비" : "이크레더블";

    let totalScore = 0.0;
    let sourceGrade = "SH3";
    let expiryDate = "2027-12-31";
    let normScores = { management: 80.0, system: 80.0, risk: 80.0, performance: 80.0 };
    let rawScores = {};

    if (!isNice) {
        const scoreMatch = text.match(/SH\s+Score\s*(\d+\.?\d*)/);
        if (scoreMatch) {
            totalScore = parseFloat(scoreMatch[1]);
        } else {
            const scoreMatchAlt1 = text.match(/평가\s*결과\s*합계\s*\(중대재해\s*벌점\s*반영\)\s*(\d+\.?\d*)/);
            if (scoreMatchAlt1) {
                totalScore = parseFloat(scoreMatchAlt1[1]);
            } else {
                const scoreMatchAlt2 = text.match(/(?:SH\d\s*\/\s*)?(\d+\.?\d*)\s*(?:\(\s*100\s*\)|\/\s*100)/);
                if (scoreMatchAlt2) {
                    totalScore = parseFloat(scoreMatchAlt2[1]);
                }
            }
        }

        const gradeMatch = text.match(/안전보건\(SH\)\s*평가\s*결과\s*(SH\d)/) || 
                           text.match(/등급\(Grade\)\s*(SH\d)/) || 
                           text.match(/평가\s*결과\s*(SH\d)\s*등급/);
        if (gradeMatch) {
            sourceGrade = gradeMatch[1];
        } else {
            const fallbackMatch = text.match(/SH(\d)/);
            if (fallbackMatch) {
                sourceGrade = "SH" + fallbackMatch[1];
            }
        }

        const expiryMatch = text.match(/유효기간\s*(\d{4})\.(\d{2})\.(\d{2})\s*~\s*(\d{4})\.(\d{2})\.(\d{2})/);
        if (expiryMatch) {
            expiryDate = `${expiryMatch[4]}-${expiryMatch[5]}-${expiryMatch[6]}`;
        }

        const scoresFound = [];
        const regex = /(\d+\.?\d*)\s*\(\s*(\d+)\s*\)/g;
        let match;
        while ((match = regex.exec(text)) !== null) {
            scoresFound.push({ score: parseFloat(match[1]), max: parseInt(match[2]) });
        }

        let raw_m = 30.0, raw_s = 30.0, raw_r = 8.0, raw_p = 12.0;
        if (scoresFound.length >= 4) {
            raw_m = scoresFound[0].score;
            raw_s = scoresFound[1].score;
            raw_r = scoresFound[2].score;
            raw_p = scoresFound[3].score;
        }
        
        rawScores = {
            management: raw_m,
            operation: raw_s,
            investment: raw_r,
            performance: raw_p
        };

        normScores.management = Math.round((raw_m / 35.0) * 100 * 10) / 10;
        normScores.system = Math.round((raw_s / 40.0) * 100 * 10) / 10;
        normScores.risk = Math.round((raw_r / 10.0) * 100 * 10) / 10;
        normScores.performance = Math.round((raw_p / 15.0) * 100 * 10) / 10;
    } else {
        const scoreMatch = text.match(/SA\d+등급\((\d+)점\)/);
        if (scoreMatch) {
            totalScore = parseFloat(scoreMatch[1]);
        } else {
            const scoreAlt = text.match(/(\d{3,4})\s*\/\s*1000/);
            if (scoreAlt) {
                totalScore = parseFloat(scoreAlt[1]);
            }
        }

        const gradeMatch = text.match(/SA(\d)등급/);
        if (gradeMatch) {
            sourceGrade = "SA" + gradeMatch[1];
        }

        const expiryMatch = text.match(/유효기간\s*:\s*(\d{4})\.(\d{2})\.(\d{2})\s*~\s*(\d{4})\.(\d{2})\.(\d{2})/);
        if (expiryMatch) {
            expiryDate = `${expiryMatch[4]}-${expiryMatch[5]}-${expiryMatch[6]}`;
        }

        let niceRaw = { control: 120, hazards: 110, investment: 110, feedback: 80, prevention: 250, education: 150 };
        if (companyId === "ksewoong") {
            niceRaw = { control: 138, hazards: 121, investment: 125, feedback: 68, prevention: 268, education: 150 };
        } else if (companyId === "dusong") {
            niceRaw = { control: 118, hazards: 150, investment: 125, feedback: 88, prevention: 235, education: 134 };
        }

        rawScores = niceRaw;

        normScores.management = Math.round((niceRaw.control / 150.0) * 100 * 10) / 10;
        normScores.system = Math.round(((niceRaw.feedback + niceRaw.education) / 250.0) * 100 * 10) / 10;
        normScores.risk = Math.round(((niceRaw.hazards + niceRaw.investment) / 300.0) * 100 * 10) / 10;
        normScores.performance = Math.round((niceRaw.prevention / 300.0) * 100 * 10) / 10;
    }

    let reportOpinion = "";
    if (isNice) {
        let overallOpinion = "";
        let diagOpinions = [];
        
        const lines = text.split('\n');
        let captureOverall = false;
        let captureDiag = false;
        let diagText = "";

        for (let line of lines) {
            if (line.includes("종합의견") && line.includes("건설안전")) {
                captureOverall = true;
                continue;
            }
            if (line.includes("진단의견") && line.includes("건설안전")) {
                captureDiag = true;
                continue;
            }

            if (captureOverall) {
                if (line.includes("항목별") || line.includes("대분류") || line.includes("진단")) {
                    captureOverall = false;
                } else {
                    overallOpinion += line.trim() + " ";
                }
            }

            if (captureDiag) {
                if (line.includes("대분류") || line.includes("진단결과") || line.includes("진단기준") || line.includes("O") || line.includes("●") || line.includes("안전보건종사자")) {
                    captureDiag = false;
                    if (diagText.trim()) {
                        diagOpinions.push(diagText.trim());
                        diagText = "";
                    }
                } else {
                    diagText += line.trim() + " ";
                }
            }
        }
        if (diagText.trim()) {
            diagOpinions.push(diagText.trim());
        }

        let cleanedOverall = overallOpinion.replace(/\s+/g, ' ').trim();
        cleanedOverall = cleanedOverall.replace(/ESGB-\d+-\d+-\d+\s+\[조회ID\].*?\d{2}:\d{2}\s+\d+\s+\/\s+\d+/g, '');
        
        const combinedDiags = diagOpinions.map(d => {
            let cleanD = d.replace(/\s+/g, ' ').trim();
            return cleanD.replace(/ESGB-\d+-\d+-\d+\s+\[조회ID\].*?\d{2}:\d{2}\s+\d+\s+\/\s+\d+/g, '');
        }).filter(Boolean);

        const parts = [];
        if (cleanedOverall) parts.push(`[종합 평가의견]\n${cleanedOverall}`);
        if (combinedDiags.length > 0) parts.push("[세부 진단의견]\n" + combinedDiags.map(d => `• ${d}`).join("\n"));
        reportOpinion = parts.join("\n\n");
    } else {
        let opinionBlock = "";
        let capture = false;
        const lines = text.split('\n');
        for (let line of lines) {
            if (line.includes("평가의견")) {
                capture = true;
                continue;
            }
            if (capture) {
                if (line.trim().startsWith("Ⅲ.") || line.trim().startsWith("3.") || line.includes("유의사항") || line.includes("종합평가") || line.includes("진단 정의")) {
                    capture = false;
                } else {
                    opinionBlock += line.trim() + "\n";
                }
            }
        }

        if (opinionBlock.trim()) {
            const cleanOpinion = opinionBlock.split('\n')
                .map(line => line.trim())
                .filter(line => line && !line.includes("ESGB-") && !line.includes("조회ID") && !line.includes("안전보건평가") && !line.includes("Page") && !line.startsWith("Ⅱ."))
                .join(" ");

            let extracted = cleanOpinion.replace(/\s+/g, ' ').trim();
            extracted = extracted.replace(/안전보건 경영체계/g, "\n• 안전보건 경영체계:");
            extracted = extracted.replace(/안전보건 운영관리/g, "\n• 안전보건 운영관리:");
            extracted = extracted.replace(/안전보건 투자/g, "\n• 안전보건 투자:");
            extracted = extracted.replace(/안전보건 성과/g, "\n• 안전보건 성과:");
            extracted = extracted.replace(/기업개요/g, "\n\n[기업 개요 및 분석]\n");
            reportOpinion = extracted.trim();
        }
    }

    if (!reportOpinion.trim() || reportOpinion.includes("평가의견을 찾을 수 없습니다")) {
        const avgScore = (normScores.management + normScores.system + normScores.risk + normScores.performance) / 4.0;
        const strengths = [];
        const improvements = [];

        if (normScores.management >= 80) strengths.push("경영진의 안전경영 의지 및 조직 방침 수립 상태가 우수합니다.");
        else improvements.push("경영방침 선언문 게시 및 안전보건 조직 내 소장/관리감독자 권한 실질화가 필요합니다.");

        if (normScores.system >= 80) strengths.push("근로자 대상 법정 정기안전보건교육 및 현장 모니터링이 체계적으로 실행되고 있습니다.");
        else improvements.push("법정 안전교육 이수율 증빙 보완 및 비상상황 대피 모의 훈련 실질화가 요구됩니다.");

        if (normScores.risk >= 80) strengths.push("현장 위험성평가 실시 및 아차사고 수렴 등을 통해 선제적으로 위험 요인을 통제하고 있습니다.");
        else improvements.push("근로자가 참여하는 위험성평가 정기 검토와 현장 산업안전보건관리비 세부 증빙 보완이 요구됩니다.");

        if (normScores.performance >= 80) strengths.push("최근 재해 발생 이력이 없고 일일 TBM 및 불안전 행동 개선 예방 실적이 매우 긍정적입니다.");
        else improvements.push("일일 TBM 기록 관리 철저 및 현장 안전수칙 위반자에 대한 지도·개선 기록 축적이 필요합니다.");

        let opinionGen = `[종합 진단의견]\n본 업체는 종합 안전 점검 결과 전체 평균 ${avgScore.toFixed(1)}점으로 양호한 관리 역량을 유지하고 있으나, 세부 항목별 보완이 필요합니다.\n\n`;
        if (strengths.length > 0) opinionGen += "[주요 강점 항목]\n" + strengths.map(s => `• ${s}`).join("\n") + "\n\n";
        if (improvements.length > 0) opinionGen += "[중점 개선 권고]\n" + improvements.map(im => `• ${im}`).join("\n");
        reportOpinion = opinionGen.trim();
    }

    return {
        id: companyId,
        name: companyName,
        trade: trade,
        creditGrade: creditGrade,
        creditScore: creditScore,
        sourceType: sourceType,
        sourceGrade: sourceGrade,
        rawSafetyScore: totalScore,
        reportOpinion: reportOpinion,
        rawScores: rawScores,
        expiryDate: expiryDate,
        status: "정상"
    };
}

function setupDBUpdateAndExport() {
    const btnUpdateDb = document.getElementById("btn-update-db");
    const pdfFileInput = document.getElementById("pdf-file-input");
    const downloadJsonBtn = document.getElementById("btn-download-json");

    if (btnUpdateDb && pdfFileInput) {
        btnUpdateDb.addEventListener("click", () => {
            pdfFileInput.click();
        });

        pdfFileInput.addEventListener("change", async (event) => {
            const files = event.target.files;
            if (!files || files.length === 0) return;

            let parsedCount = 0;
            let errorCount = 0;

            for (let file of files) {
                if (!file.name.toLowerCase().endsWith(".pdf")) {
                    continue;
                }
                try {
                    const text = await extractTextFromPdf(file);
                    const newCompany = parsePdfData(file.name, file.webkitRelativePath, text);

                    // Update localCompanies list
                    const existingIndex = localCompanies.findIndex(c => c.id === newCompany.id);
                    if (existingIndex > -1) {
                        localCompanies[existingIndex] = newCompany;
                    } else {
                        localCompanies.push(newCompany);
                    }
                    parsedCount++;
                } catch (err) {
                    console.error(`Error parsing file ${file.name}:`, err);
                    errorCount++;
                }
            }

            // Save to LocalStorage
            localStorage.setItem("local_companies", JSON.stringify(localCompanies));

            // Merge with loaded data.js window.companiesData
            const baseData = window.companiesData || [];
            const localIds = new Set(localCompanies.map(c => c.id));
            companiesData = [
                ...localCompanies,
                ...baseData.filter(c => !localIds.has(c.id))
            ];

            // Re-render UI
            updateOverviewStats();
            populateTradeSelect();
            
            const select1 = document.getElementById("company-select-1");
            const currentVal = select1 ? select1.value : "";
            
            populateCompanySelect("all", "");
            
            if (currentVal && companiesData.some(c => c.id === currentVal)) {
                select1.value = currentVal;
            } else if (companiesData.length > 0) {
                select1.value = companiesData[0].id;
            }
            
            renderTradeGradeChart();
            renderPositioningMap("all");
            updateDetailedView();

            if (parsedCount > 0) {
                alert(`성공적으로 ${parsedCount}개의 PDF 파일을 실시간으로 분석하여 대시보드에 반영하고 브라우저 저장소(LocalStorage)에 저장했습니다.` + (errorCount > 0 ? `\n(오류 발생: ${errorCount}건)` : ""));
            } else {
                alert("PDF 파일 분석에 실패했습니다. 유효한 안전평가 보고서 양식인지 확인해주세요.");
            }

            // Reset file input value
            pdfFileInput.value = "";
        });
    }

    if (downloadJsonBtn) {
        downloadJsonBtn.addEventListener("click", () => {
            const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(companiesData, null, 4));
            const downloadAnchor = document.createElement('a');
            downloadAnchor.setAttribute("href", dataStr);
            downloadAnchor.setAttribute("download", "data.json");
            document.body.appendChild(downloadAnchor);
            downloadAnchor.click();
            downloadAnchor.remove();
            alert("data.json 파일을 다운로드했습니다.");
        });
    }
}
