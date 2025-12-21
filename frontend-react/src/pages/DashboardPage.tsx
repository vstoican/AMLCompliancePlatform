import {
  StatsOverview,
  RecentAlerts,
  MyTasks,
  RiskDistribution,
  TasksOverview,
} from '@/components/dashboard'

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Overview of your AML compliance monitoring
        </p>
      </div>

      {/* Stats Grid */}
      <StatsOverview />

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-2">
        <MyTasks />
        <TasksOverview />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <RecentAlerts />
        <RiskDistribution />
      </div>
    </div>
  )
}
