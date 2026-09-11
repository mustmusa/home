const STORAGE_KEY = "home-expenses-v1";

const CATEGORY_ICONS = {
  "طعام": "🍽️",
  "مواصلات": "🚗",
  "فواتير": "💡",
  "صحة": "💊",
  "تسوق": "🛍️",
  "ترفيه": "🎬",
  "تعليم": "📚",
  "أخرى": "📦",
};

const form = document.getElementById("expenseForm");
const amountInput = document.getElementById("amount");
const categoryInput = document.getElementById("category");
const descriptionInput = document.getElementById("description");
const dateInput = document.getElementById("date");
const expenseList = document.getElementById("expenseList");
const emptyState = document.getElementById("emptyState");
const monthTotalEl = document.getElementById("monthTotal");
const allTotalEl = document.getElementById("allTotal");
const countTotalEl = document.getElementById("countTotal");
const categoryBreakdown = document.getElementById("categoryBreakdown");
const monthFilter = document.getElementById("monthFilter");
const categoryFilter = document.getElementById("categoryFilter");

function loadExpenses() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function saveExpenses(expenses) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(expenses));
}

function formatAmount(value) {
  return new Intl.NumberFormat("ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(value);
}

function todayISO() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function currentMonthKey() {
  return todayISO().slice(0, 7);
}

let expenses = loadExpenses();

function render() {
  const selectedMonth = monthFilter.value;
  const selectedCategory = categoryFilter.value;

  const filtered = expenses
    .filter((e) => (selectedMonth ? e.date.slice(0, 7) === selectedMonth : true))
    .filter((e) => (selectedCategory ? e.category === selectedCategory : true))
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.createdAt - a.createdAt));

  expenseList.innerHTML = "";
  emptyState.style.display = filtered.length ? "none" : "block";

  for (const exp of filtered) {
    const li = document.createElement("li");
    li.className = "expense-item";
    li.innerHTML = `
      <div class="expense-info">
        <span class="expense-category">${CATEGORY_ICONS[exp.category] || "📦"} ${exp.category}</span>
        ${exp.description ? `<span class="expense-desc">${escapeHtml(exp.description)}</span>` : ""}
        <span class="expense-date">${exp.date}</span>
      </div>
      <div class="expense-right">
        <span class="expense-amount">${formatAmount(exp.amount)}</span>
        <button class="delete-btn" data-id="${exp.id}" title="حذف">🗑️</button>
      </div>
    `;
    expenseList.appendChild(li);
  }

  const monthKey = currentMonthKey();
  const monthExpenses = expenses.filter((e) => e.date.slice(0, 7) === monthKey);
  const monthTotal = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  const allTotal = expenses.reduce((sum, e) => sum + e.amount, 0);

  monthTotalEl.textContent = formatAmount(monthTotal);
  allTotalEl.textContent = formatAmount(allTotal);
  countTotalEl.textContent = expenses.length;

  renderCategoryBreakdown(monthExpenses, monthTotal);
}

function renderCategoryBreakdown(monthExpenses, monthTotal) {
  categoryBreakdown.innerHTML = "";

  const totals = {};
  for (const exp of monthExpenses) {
    totals[exp.category] = (totals[exp.category] || 0) + exp.amount;
  }

  const entries = Object.entries(totals).sort((a, b) => b[1] - a[1]);

  if (!entries.length) {
    categoryBreakdown.innerHTML = '<p class="empty-state">لا توجد مصاريف هذا الشهر.</p>';
    return;
  }

  for (const [category, amount] of entries) {
    const percent = monthTotal ? Math.round((amount / monthTotal) * 100) : 0;
    const row = document.createElement("div");
    row.className = "category-row";
    row.innerHTML = `
      <span class="category-name">${CATEGORY_ICONS[category] || "📦"} ${category}</span>
      <span class="category-bar-track"><span class="category-bar-fill" style="width:${percent}%"></span></span>
      <span class="category-amount">${formatAmount(amount)}</span>
    `;
    categoryBreakdown.appendChild(row);
  }
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

form.addEventListener("submit", (e) => {
  e.preventDefault();

  const amount = parseFloat(amountInput.value);
  if (!amount || amount <= 0) return;

  const expense = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now()),
    amount,
    category: categoryInput.value,
    description: descriptionInput.value.trim(),
    date: dateInput.value || todayISO(),
    createdAt: Date.now(),
  };

  expenses.push(expense);
  saveExpenses(expenses);
  form.reset();
  dateInput.value = todayISO();
  render();
});

expenseList.addEventListener("click", (e) => {
  const btn = e.target.closest(".delete-btn");
  if (!btn) return;
  const id = btn.dataset.id;
  expenses = expenses.filter((exp) => exp.id !== id);
  saveExpenses(expenses);
  render();
});

monthFilter.addEventListener("change", render);
categoryFilter.addEventListener("change", render);

dateInput.value = todayISO();
monthFilter.value = currentMonthKey();
render();
