import { type ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ErrorBoundary } from '@/components/error-boundary';
import { Toaster } from '@/components/ui/toaster';
import { TooltipProvider } from '@/components/ui/tooltip';
import { Layout } from '@/components/layout';

import Dashboard from '@/pages/dashboard';
import CreateCampaign from '@/pages/create-campaign';
import Campaigns from '@/pages/campaigns';
import CampaignDetail from '@/pages/campaign-detail';
import Approvals from '@/pages/approvals';
import Reporting from '@/pages/reporting';
import NotFound from '@/pages/not-found';

import TaxonomyList from '@/pages/taxonomy/list';
import TaxonomyDetail from '@/pages/taxonomy/detail';
import TaxonomyImports from '@/pages/taxonomy/imports';
import TaxonomyReviewRequests from '@/pages/taxonomy/review-requests';

import {
  Route,
  Switch,
  useLocation,
  Router as WouterRouter,
} from 'wouter';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Layout>
      <RoutedErrorBoundary>
        <Switch>
          <Route path="/" component={Dashboard} />
          
          {/* Campaign Workspace */}
          <Route path="/create-campaign" component={CreateCampaign} />
          <Route path="/campaigns" component={Campaigns} />
          <Route path="/campaigns/:id" component={CampaignDetail} />
          
          <Route path="/approvals" component={Approvals} />
          
          {/* Foundation Taxonomy */}
          <Route path="/taxonomy" component={TaxonomyList} />
          <Route path="/taxonomy/imports" component={TaxonomyImports} />
          <Route path="/taxonomy/review-requests" component={TaxonomyReviewRequests} />
          <Route path="/taxonomy/new" component={TaxonomyDetail} />
          <Route path="/taxonomy/:id" component={TaxonomyDetail} />

          <Route path="/reporting" component={Reporting} />
          
          <Route component={NotFound} />
        </Switch>
      </RoutedErrorBoundary>
    </Layout>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={200}>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
