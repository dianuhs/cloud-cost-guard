import React, { useEffect, useState } from "react";
import "./App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";

// Import UI components
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Button } from "./components/ui/button";
import { Badge } from "./components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "./components/ui/tabs";
import { Alert, AlertDescription } from "./components/ui/alert";
import { Progress } from "./components/ui/progress";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "./components/ui/table";
import { Separator } from "./components/ui/separator";

// Import icons
import { 
  DollarSign, 
  TrendingUp, 
  TrendingDown, 
  AlertTriangle, 
  Server, 
  HardDrive, 
  Network, 
  Eye,
  Download,
  BarChart3,
  Activity,
  Cloud,
  Zap,
  CheckCircle,
  XCircle
} from "lucide-react";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Utility functions
const formatCurrency = (amount) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }).format(amount);
};

const formatPercent = (percent) => {
  const sign = percent >= 0 ? '+' : '';
  return `${sign}${percent.toFixed(1)}%`;
};

const getSeverityColor = (severity) => {
  const colors = {
    'critical': 'bg-red-100 text-red-800 border-red-200',
    'high': 'bg-orange-100 text-orange-800 border-orange-200', 
    'medium': 'bg-yellow-100 text-yellow-800 border-yellow-200',
    'low': 'bg-green-100 text-green-800 border-green-200'
  };
  return colors[severity] || colors.medium;
};

const getSeverityIcon = (severity) => {
  switch(severity) {
    case 'critical': return <XCircle className="h-4 w-4 text-red-600" />;
    case 'high': return <AlertTriangle className="h-4 w-4 text-orange-600" />;
    case 'medium': return <AlertTriangle className="h-4 w-4 text-yellow-600" />;
    case 'low': return <CheckCircle className="h-4 w-4 text-green-600" />;
    default: return <AlertTriangle className="h-4 w-4" />;
  }
};

// Dashboard Components
const KPICard = ({ title, value, change, icon: Icon, subtitle }) => (
  <Card className="hover:shadow-lg transition-all duration-200">
    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
      <CardTitle className="text-sm font-medium text-slate-600">{title}</CardTitle>
      <Icon className="h-4 w-4 text-slate-400" />
    </CardHeader>
    <CardContent>
      <div className="text-2xl font-bold text-slate-900">{value}</div>
      {change !== undefined && (
        <p className="text-xs text-slate-600 flex items-center gap-1 mt-1">
          {change >= 0 ? (
            <TrendingUp className="h-3 w-3 text-green-600" />
          ) : (
            <TrendingDown className="h-3 w-3 text-red-600" />
          )}
          <span className={change >= 0 ? 'text-green-600' : 'text-red-600'}>
            {formatPercent(change)}
          </span>
          {subtitle}
        </p>
      )}
      {subtitle && change === undefined && (
        <p className="text-xs text-slate-600 mt-1">{subtitle}</p>
      )}
    </CardContent>
  </Card>
);

const FindingCard = ({ finding, onViewDetails }) => (
  <Card className="hover:shadow-md transition-all duration-200">
    <CardHeader className="pb-3">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-2">
          {getSeverityIcon(finding.severity)}
          <CardTitle className="text-sm font-medium">{finding.title}</CardTitle>
        </div>
        <Badge className={getSeverityColor(finding.severity)}>
          {finding.severity.toUpperCase()}
        </Badge>
      </div>
    </CardHeader>
    <CardContent>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm text-slate-600">Monthly Savings</span>
          <span className="text-lg font-semibold text-green-700">
            {formatCurrency(finding.monthly_savings_usd_est)}
          </span>
        </div>
        <p className="text-sm text-slate-700">{finding.suggested_action}</p>
        {finding.commands && finding.commands.length > 0 && (
          <div className="bg-slate-50 p-2 rounded text-xs font-mono text-slate-700">
            {finding.commands[0]}
          </div>
        )}
        <Button 
          variant="outline" 
          size="sm" 
          onClick={() => onViewDetails(finding)}
          className="w-full"
        >
          <Eye className="h-3 w-3 mr-1" />
          View Details
        </Button>
      </div>
    </CardContent>
  </Card>
);

const ProductTable = ({ products }) => (
  <Table>
    <TableHeader>
      <TableRow>
        <TableHead>Product</TableHead>
        <TableHead className="text-right">30d Cost</TableHead>
        <TableHead className="text-right">WoW Change</TableHead>
        <TableHead className="text-right">% of Total</TableHead>
      </TableRow>
    </TableHeader>
    <TableBody>
      {products.map((product, index) => (
        <TableRow key={index}>
          <TableCell className="font-medium">{product.product}</TableCell>
          <TableCell className="text-right">{formatCurrency(product.amount_usd)}</TableCell>
          <TableCell className="text-right">
            <div className={`flex items-center justify-end gap-1 ${
              product.wow_delta >= 0 ? 'text-red-600' : 'text-green-600'
            }`}>
              {product.wow_delta >= 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {formatCurrency(Math.abs(product.wow_delta))}
            </div>
          </TableCell>
          <TableCell className="text-right">{product.percent_of_total.toFixed(1)}%</TableCell>
        </TableRow>
      ))}
    </TableBody>
  </Table>
);

// Main Dashboard Component
const Dashboard = () => {
  const [summary, setSummary] = useState(null);
  const [findings, setFindings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Load summary data
      const summaryResponse = await axios.get(`${API}/summary?window=30d`);
      setSummary(summaryResponse.data);

      // Load detailed findings
      const findingsResponse = await axios.get(`${API}/findings?sort=savings&limit=50`);
      setFindings(findingsResponse.data);

    } catch (err) {
      console.error('Error loading data:', err);
      setError('Failed to load cost data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleViewDetails = (finding) => {
    // For now, just show an alert - in production this would open a modal or navigate
    const evidence = JSON.stringify(finding.evidence, null, 2);
    alert(`Finding Details:\n\n${finding.title}\n\nEvidence:\n${evidence}\n\nCommands:\n${finding.commands.join('\n')}`);
  };

  const exportCSV = async () => {
    try {
      const response = await axios.get(`${API}/findings?sort=savings&limit=1000`);
      const findings = response.data;
      
      // Create CSV content
      const headers = ['Title', 'Type', 'Severity', 'Monthly Savings', 'Resource ID', 'Action'];
      const rows = findings.map(f => [
        f.title,
        f.type,
        f.severity,
        f.monthly_savings_usd_est,
        f.resource_id || '',
        f.suggested_action
      ]);
      
      const csvContent = [headers, ...rows]
        .map(row => row.map(field => `"${field}"`).join(','))
        .join('\n');
      
      // Download file
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'cost-findings.csv';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
      alert('Export failed. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <p className="text-slate-600">Loading cost analysis...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
        <Alert className="max-w-md">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const { kpis, top_products, recent_findings } = summary;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Header */}
      <div className="bg-white border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Cloud className="h-6 w-6 text-white" />
              </div>
              <div>
                <h1 className="text-2xl font-bold text-slate-900">Cloud Cost Guard</h1>
                <p className="text-sm text-slate-600">Multi-cloud cost optimization</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={exportCSV}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
              <Button onClick={loadData}>
                <Activity className="h-4 w-4 mr-2" />
                Refresh
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* KPI Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
          <KPICard
            title="Total 30d Cost"
            value={formatCurrency(kpis.total_30d_cost)}
            change={kpis.wow_percent}
            icon={DollarSign}
            subtitle="vs last week"
          />
          <KPICard
            title="Savings Ready"
            value={formatCurrency(kpis.savings_ready_usd)}
            icon={Zap}
            subtitle="potential monthly savings"
          />
          <KPICard
            title="Under-utilized"
            value={kpis.underutilized_count}
            icon={Server}
            subtitle="compute resources"
          />
          <KPICard
            title="Orphaned Resources"
            value={kpis.orphans_count}
            icon={HardDrive}
            subtitle="unattached volumes"
          />
        </div>

        {/* Main Content Tabs */}
        <Tabs defaultValue="findings" className="space-y-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="findings">Findings</TabsTrigger>
            <TabsTrigger value="products">Products</TabsTrigger>
            <TabsTrigger value="overview">Overview</TabsTrigger>
          </TabsList>

          {/* Findings Tab */}
          <TabsContent value="findings" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">
                Cost Optimization Findings
              </h2>
              <Badge variant="outline" className="text-green-700 border-green-300">
                {formatCurrency(kpis.savings_ready_usd)}/month potential
              </Badge>
            </div>

            {findings.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-slate-900 mb-2">All Good!</h3>
                  <p className="text-slate-600">No cost optimization opportunities found.</p>
                </CardContent>
              </Card>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {findings.map((finding) => (
                  <FindingCard
                    key={finding.finding_id}
                    finding={finding}
                    onViewDetails={handleViewDetails}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          {/* Products Tab */}
          <TabsContent value="products" className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-slate-900">
                Product Cost Breakdown
              </h2>
              <Badge variant="outline">Last 30 days</Badge>
            </div>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Top Products by Cost
                </CardTitle>
                <CardDescription>
                  Your highest spending cloud products and their week-over-week changes
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ProductTable products={top_products} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* Overview Tab */}
          <TabsContent value="overview" className="space-y-6">
            <h2 className="text-xl font-semibold text-slate-900">Cost Overview</h2>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Savings Potential */}
              <Card>
                <CardHeader>
                  <CardTitle>Savings Potential</CardTitle>
                  <CardDescription>
                    Breakdown of optimization opportunities by type
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {[
                    { type: 'Under-utilized', count: kpis.underutilized_count, color: 'bg-blue-500' },
                    { type: 'Orphaned', count: kpis.orphans_count, color: 'bg-yellow-500' },
                    { type: 'Idle', count: findings.filter(f => f.title.includes('Idle')).length, color: 'bg-red-500' }
                  ].map((item, index) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-3 h-3 rounded-full ${item.color}`}></div>
                        <span className="text-sm text-slate-700">{item.type}</span>
                      </div>
                      <span className="text-sm font-medium">{item.count}</span>
                    </div>
                  ))}
                </CardContent>
              </Card>

              {/* Recent Activity */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent Findings</CardTitle>
                  <CardDescription>
                    Latest cost optimization opportunities
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {recent_findings.slice(0, 5).map((finding, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg">
                        <div className="flex items-center gap-2">
                          {getSeverityIcon(finding.severity)}
                          <span className="text-sm text-slate-700 truncate max-w-48">
                            {finding.title}
                          </span>
                        </div>
                        <span className="text-sm font-medium text-green-700">
                          {formatCurrency(finding.monthly_savings_usd_est)}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

// Home component (wrapper)
const Home = () => {
  return <Dashboard />;
};

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Home />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

export default App;