import { BarChart, Bar, XAxis, YAxis, Tooltip, Cell, ResponsiveContainer } from 'recharts';
import { formatCurrency } from '../../utils/formatters';

interface IncomeExpensesChartProps {
  totalIncome: number;
  totalExpenses: number;
}

const IncomeExpensesChart = ({ totalIncome, totalExpenses }: IncomeExpensesChartProps) => {
  if (totalIncome === 0 && totalExpenses === 0) {
    return (
      <div className="flex items-center justify-center h-64 bg-surface rounded-lg">
        <p className="text-ink-muted">No transactions recorded this month.</p>
      </div>
    );
  }

  const data = [
    { name: 'Income', amount: totalIncome, fill: '#2DBD8B' },
    { name: 'Expenses', amount: totalExpenses, fill: '#ef4444' },
  ];

  return (
    <div className="h-64 text-ink-muted">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <XAxis dataKey="name" stroke="currentColor" tick={{ fill: 'currentColor' }} />
          <YAxis
            stroke="currentColor"
            tick={{ fill: 'currentColor' }}
            tickFormatter={(value: number) => formatCurrency(value)}
            width={90}
          />
          <Tooltip formatter={(value) => formatCurrency(Number(value))} />
          <Bar dataKey="amount" radius={[4, 4, 0, 0]}>
            {data.map((entry) => (
              <Cell key={entry.name} fill={entry.fill} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
};

export default IncomeExpensesChart;
