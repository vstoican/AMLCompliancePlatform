import { useNavigate } from 'react-router-dom'
import { ArrowRight, ArrowUpRight, ArrowDownRight, CreditCard } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/shared'
import { Skeleton } from '@/components/ui/skeleton'
import { useTransactions } from '@/hooks/queries'
import { formatCurrency, formatDistanceToNow, cn } from '@/lib/utils'

export function RecentTransactions() {
  const navigate = useNavigate()
  const { data, isLoading } = useTransactions({ pageSize: 5 })

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <div>
          <CardTitle className="text-base font-medium">Recent Transactions</CardTitle>
          <CardDescription>Latest transaction activity</CardDescription>
        </div>
        <Button variant="ghost" size="sm" onClick={() => navigate('/transactions')}>
          View All
          <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Skeleton className="h-10 w-10 rounded-full" />
                  <div className="space-y-2">
                    <Skeleton className="h-4 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <Skeleton className="h-5 w-20" />
              </div>
            ))}
          </div>
        ) : !data?.transactions?.length ? (
          <EmptyState
            icon={CreditCard}
            title="No transactions"
            description="No recent transactions to display."
            className="py-8"
          />
        ) : (
          <div className="space-y-4">
            {data.transactions.map((tx) => {
              const isCredit = tx.type?.toLowerCase().includes('credit') || tx.type?.toLowerCase().includes('deposit')
              return (
                <div
                  key={tx.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => navigate('/transactions')}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      'flex h-10 w-10 items-center justify-center rounded-full',
                      isCredit ? 'bg-green-500/20' : 'bg-blue-500/20'
                    )}>
                      {isCredit ? (
                        <ArrowDownRight className="h-5 w-5 text-green-500" />
                      ) : (
                        <ArrowUpRight className="h-5 w-5 text-blue-500" />
                      )}
                    </div>
                    <div className="space-y-0.5">
                      <div className="font-medium text-sm">
                        {tx.customer_name || tx.member_id}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {tx.type} • {formatDistanceToNow(tx.created_at)}
                      </div>
                    </div>
                  </div>
                  <div className={cn(
                    'font-semibold',
                    isCredit ? 'text-green-500' : 'text-foreground'
                  )}>
                    {isCredit ? '+' : ''}{formatCurrency(tx.amount, tx.currency)}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
