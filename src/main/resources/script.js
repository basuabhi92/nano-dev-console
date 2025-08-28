async function fetchJson(url) {
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
    }
    return await response.json();
}

async function loadData() {
    try {
        const [systemInfo, eventData, logData] = await Promise.all([
            fetchJson('/dev-console/system-info'),
            fetchJson('/dev-console/events'),
            fetchJson('/dev-console/logs')
        ]);

        document.getElementById("system").textContent = JSON.stringify(systemInfo, null, 2);
        document.getElementById("eventsData").textContent = JSON.stringify(eventData, null, 2);
        document.getElementById("logsData").textContent = JSON.stringify(logData, null, 2);
    } catch (e) {
        console.error("Error loading data:", e);
    }
}

function openTab(tabId) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(content => content.classList.remove('active'));

    document.querySelector(`.tab[data-tab="${tabId}"]`).classList.add('active');
    document.getElementById(tabId).classList.add('active');
}

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener("click", () => openTab(tab.dataset.tab));
    });

    loadData();
    setInterval(loadData, 5000);
});
