"use client"

import { useState, useEffect, useMemo } from 'react'
import { Plus, Search, ArrowUpDown, Pencil, Trash2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

interface CountryRisk {
  code: string
  name: string
  risk_score: number
}

const defaultCountryRisks: CountryRisk[] = [
  { code: 'US', name: 'United States', risk_score: 2 },
  { code: 'GB', name: 'United Kingdom', risk_score: 2 },
  { code: 'DE', name: 'Germany', risk_score: 2 },
  { code: 'FR', name: 'France', risk_score: 2 },
  { code: 'NL', name: 'Netherlands', risk_score: 2 },
  { code: 'CH', name: 'Switzerland', risk_score: 3 },
  { code: 'AT', name: 'Austria', risk_score: 2 },
  { code: 'BE', name: 'Belgium', risk_score: 2 },
  { code: 'IT', name: 'Italy', risk_score: 3 },
  { code: 'ES', name: 'Spain', risk_score: 2 },
  { code: 'PT', name: 'Portugal', risk_score: 2 },
  { code: 'PL', name: 'Poland', risk_score: 3 },
  { code: 'RO', name: 'Romania', risk_score: 4 },
  { code: 'BG', name: 'Bulgaria', risk_score: 5 },
  { code: 'HU', name: 'Hungary', risk_score: 4 },
  { code: 'CZ', name: 'Czech Republic', risk_score: 3 },
  { code: 'SK', name: 'Slovakia', risk_score: 3 },
  { code: 'SI', name: 'Slovenia', risk_score: 3 },
  { code: 'HR', name: 'Croatia', risk_score: 4 },
  { code: 'RS', name: 'Serbia', risk_score: 6 },
  { code: 'UA', name: 'Ukraine', risk_score: 7 },
  { code: 'RU', name: 'Russia', risk_score: 9 },
  { code: 'BY', name: 'Belarus', risk_score: 9 },
  { code: 'CN', name: 'China', risk_score: 6 },
  { code: 'HK', name: 'Hong Kong', risk_score: 5 },
  { code: 'SG', name: 'Singapore', risk_score: 3 },
  { code: 'JP', name: 'Japan', risk_score: 2 },
  { code: 'KR', name: 'South Korea', risk_score: 2 },
  { code: 'AE', name: 'United Arab Emirates', risk_score: 5 },
  { code: 'SA', name: 'Saudi Arabia', risk_score: 6 },
  { code: 'TR', name: 'Turkey', risk_score: 6 },
  { code: 'IL', name: 'Israel', risk_score: 4 },
  { code: 'EG', name: 'Egypt', risk_score: 6 },
  { code: 'ZA', name: 'South Africa', risk_score: 5 },
  { code: 'NG', name: 'Nigeria', risk_score: 8 },
  { code: 'KE', name: 'Kenya', risk_score: 7 },
  { code: 'BR', name: 'Brazil', risk_score: 5 },
  { code: 'MX', name: 'Mexico', risk_score: 6 },
  { code: 'AR', name: 'Argentina', risk_score: 5 },
  { code: 'CO', name: 'Colombia', risk_score: 6 },
  { code: 'VE', name: 'Venezuela', risk_score: 9 },
  { code: 'PA', name: 'Panama', risk_score: 7 },
  { code: 'KY', name: 'Cayman Islands', risk_score: 7 },
  { code: 'VG', name: 'British Virgin Islands', risk_score: 8 },
  { code: 'CY', name: 'Cyprus', risk_score: 6 },
  { code: 'MT', name: 'Malta', risk_score: 5 },
  { code: 'AF', name: 'Afghanistan', risk_score: 10 },
  { code: 'IR', name: 'Iran', risk_score: 10 },
  { code: 'KP', name: 'North Korea', risk_score: 10 },
  { code: 'SY', name: 'Syria', risk_score: 10 },
  { code: 'MM', name: 'Myanmar', risk_score: 9 },
]

function getRiskLevel(score: number): { level: string; color: string } {
  if (score >= 8) return { level: 'Critical', color: 'bg-red-500/10 text-red-500 border-red-500/20' }
  if (score >= 6) return { level: 'High', color: 'bg-orange-500/10 text-orange-500 border-orange-500/20' }
  if (score >= 4) return { level: 'Medium', color: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' }
  return { level: 'Low', color: 'bg-green-500/10 text-green-500 border-green-500/20' }
}

type SortColumn = 'name' | 'code' | 'risk_score'
type SortDirection = 'asc' | 'desc'

export function GeographyRiskSettings() {
  const [countries, setCountries] = useState<CountryRisk[]>([])
  const [searchTerm, setSearchTerm] = useState('')
  const [sortColumn, setSortColumn] = useState<SortColumn>('risk_score')
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc')
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingCountry, setEditingCountry] = useState<CountryRisk | null>(null)
  const [formData, setFormData] = useState({ code: '', name: '', risk_score: 5 })

  useEffect(() => {
    const saved = localStorage.getItem('trustrelayCountryRisks')
    if (saved) {
      try {
        setCountries(JSON.parse(saved))
      } catch {
        setCountries([...defaultCountryRisks])
      }
    } else {
      setCountries([...defaultCountryRisks])
    }
  }, [])

  const saveCountries = (newCountries: CountryRisk[]) => {
    setCountries(newCountries)
    localStorage.setItem('trustrelayCountryRisks', JSON.stringify(newCountries))
  }

  const filteredAndSortedCountries = useMemo(() => {
    let result = countries.filter(
      (c) =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.code.toLowerCase().includes(searchTerm.toLowerCase())
    )

    result.sort((a, b) => {
      let aVal: string | number
      let bVal: string | number

      switch (sortColumn) {
        case 'name':
          aVal = a.name.toLowerCase()
          bVal = b.name.toLowerCase()
          break
        case 'code':
          aVal = a.code.toLowerCase()
          bVal = b.code.toLowerCase()
          break
        case 'risk_score':
          aVal = a.risk_score
          bVal = b.risk_score
          break
      }

      if (aVal < bVal) return sortDirection === 'asc' ? -1 : 1
      if (aVal > bVal) return sortDirection === 'asc' ? 1 : -1
      return 0
    })

    return result
  }, [countries, searchTerm, sortColumn, sortDirection])

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')
    } else {
      setSortColumn(column)
      setSortDirection(column === 'risk_score' ? 'desc' : 'asc')
    }
  }

  const openAddDialog = () => {
    setEditingCountry(null)
    setFormData({ code: '', name: '', risk_score: 5 })
    setIsDialogOpen(true)
  }

  const openEditDialog = (country: CountryRisk) => {
    setEditingCountry(country)
    setFormData({ ...country })
    setIsDialogOpen(true)
  }

  const handleSave = () => {
    if (!formData.code || !formData.name) return

    if (editingCountry) {
      // Update existing
      const updated = countries.map((c) =>
        c.code === editingCountry.code ? { ...formData } : c
      )
      saveCountries(updated)
    } else {
      // Add new
      if (countries.some((c) => c.code === formData.code)) {
        alert('Country code already exists')
        return
      }
      saveCountries([...countries, { ...formData }])
    }
    setIsDialogOpen(false)
  }

  const handleDelete = (code: string) => {
    if (confirm('Are you sure you want to delete this country?')) {
      saveCountries(countries.filter((c) => c.code !== code))
    }
  }

  const handleReset = () => {
    if (confirm('Reset all country risk scores to defaults?')) {
      saveCountries([...defaultCountryRisks])
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Country Risk Scores</CardTitle>
            <CardDescription>
              Assign risk scores (1-10) to countries for geographic risk assessment
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={handleReset}>
              Reset to Defaults
            </Button>
            <Button onClick={openAddDialog}>
              <Plus className="h-4 w-4 mr-2" />
              Add Country
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search countries..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
        </div>

        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('code')}
                >
                  <div className="flex items-center gap-1">
                    Code
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('name')}
                >
                  <div className="flex items-center gap-1">
                    Country
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('risk_score')}
                >
                  <div className="flex items-center gap-1">
                    Risk Score
                    <ArrowUpDown className="h-4 w-4" />
                  </div>
                </TableHead>
                <TableHead>Risk Level</TableHead>
                <TableHead className="w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedCountries.map((country) => {
                const risk = getRiskLevel(country.risk_score)
                return (
                  <TableRow key={country.code}>
                    <TableCell className="font-mono">{country.code}</TableCell>
                    <TableCell className="font-medium">{country.name}</TableCell>
                    <TableCell>
                      <span className="font-semibold">{country.risk_score}</span>
                      <span className="text-muted-foreground">/10</span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className={risk.color}>
                        {risk.level}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openEditDialog(country)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(country.code)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })}
              {filteredAndSortedCountries.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    No countries found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <p className="text-sm text-muted-foreground mt-4">
          Showing {filteredAndSortedCountries.length} of {countries.length} countries
        </p>
      </CardContent>

      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingCountry ? 'Edit Country Risk' : 'Add Country'}
            </DialogTitle>
            <DialogDescription>
              {editingCountry
                ? 'Update the risk score for this country'
                : 'Add a new country with its risk score'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="code">Country Code</Label>
                <Input
                  id="code"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({ ...formData, code: e.target.value.toUpperCase() })
                  }
                  placeholder="US"
                  maxLength={2}
                  disabled={!!editingCountry}
                />
              </div>
              <div>
                <Label htmlFor="name">Country Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="United States"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="risk_score">Risk Score (1-10)</Label>
              <Select
                value={formData.risk_score.toString()}
                onValueChange={(value) =>
                  setFormData({ ...formData, risk_score: Number(value) })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((score) => {
                    const risk = getRiskLevel(score)
                    return (
                      <SelectItem key={score} value={score.toString()}>
                        <span className="flex items-center gap-2">
                          {score} - {risk.level}
                        </span>
                      </SelectItem>
                    )
                  })}
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave}>
              {editingCountry ? 'Save Changes' : 'Add Country'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
