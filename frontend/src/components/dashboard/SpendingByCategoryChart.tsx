import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../../utils/formatters';

interface SpendingByCategoryChartProps {
  byCategory: Record<string, number>;
}

const CATEGORY_LABELS: Record<string, string> = {
  FOOD_DINING: 'Food & Dining',
  TRANSPORTATION: 'Transportation',
  SHOPPING: 'Shopping',
  ENTERTAINMENT: 'Entertainment',
  BILLS_UTILITIES: 'Bills & Utilities',
  HEALTHCARE: 'Healthcare',
  EDUCATION: 'Education',
  TRAVEL: 'Travel',
  INCOME_SALARY: 'Salary',
  INCOME_BUSINESS: 'Business Income',
  TRANSFER: 'Transfer',
  OTHER: 'Other',
};

const SLICE_COLORS = ['#2DBD8B', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

const SpendingByCategoryChart = ({ byCategory }: SpendingByCategoryChartProps) => {
  const data = Object.entries(byCategory)
    .filter(([, amount]) => amount > 0)
    .map(([category, amount]) => ({
      name: CATEGORY_LABELS[category] ?? category,
      value: amount,
    }));

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-surface rounded-lg">
        <p className="text-ink-muted">No spending recorded this month.</p>
      </div>
    );
  }

  return (
    <div className="h-64 text-ink-muted">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80}>
            {data.map((entry, index) => (
              <Cell key={entry.name} fill={SLICE_COLORS[index % SLICE_COLORS.length]} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
          <Legend wrapperStyle={{ fontSize: 12, color: 'currentColor' }} />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SpendingByCategoryChart;
