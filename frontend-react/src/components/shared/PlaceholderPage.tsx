import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Construction } from 'lucide-react'

interface PlaceholderPageProps {
  title: string
  description?: string
  icon?: React.ComponentType<{ className?: string }>
}

export function PlaceholderPage({
  title,
  description = 'This page is under construction.',
  icon: Icon = Construction
}: PlaceholderPageProps) {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <Card className="w-full max-w-md text-center">
        <CardHeader>
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted">
            <Icon className="h-8 w-8 text-muted-foreground" />
          </div>
          <CardTitle>{title}</CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            This feature will be available soon as part of the React migration.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
