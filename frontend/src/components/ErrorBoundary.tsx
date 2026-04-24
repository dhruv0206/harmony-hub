import { Component, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { AlertTriangle, RefreshCw, Home, Bug } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /** Optional context name for error logging */
  context?: string;
  /** If true, renders inline (no full-page takeover) */
  inline?: boolean;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    this.setState({ errorInfo });
    console.error(
      `[ErrorBoundary${this.props.context ? `: ${this.props.context}` : ""}]`,
      error,
      errorInfo
    );
    // In production, you would send this to an error tracking service
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      if (this.props.inline) {
        return (
          <Card className="border-destructive/30">
            <CardContent className="flex flex-col items-center justify-center py-8 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive mb-3" />
              <h3 className="text-sm font-semibold mb-1">This section encountered an error</h3>
              <p className="text-xs text-muted-foreground mb-3 max-w-sm">
                {this.state.error?.message || "An unexpected error occurred"}
              </p>
              <Button variant="outline" size="sm" onClick={this.handleReset}>
                <RefreshCw className="h-3 w-3 mr-1.5" />Try Again
              </Button>
            </CardContent>
          </Card>
        );
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-[60vh] p-8 text-center">
          <div className="w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-6">
            <AlertTriangle className="h-8 w-8 text-destructive" />
          </div>
          <h1 className="text-2xl font-bold mb-2 text-foreground">Something went wrong</h1>
          <p className="text-muted-foreground mb-6 max-w-md">
            We're sorry — an unexpected error occurred. Please try again or return to the dashboard.
          </p>
          {this.state.error?.message && (
            <details className="mb-6 max-w-lg text-left">
              <summary className="text-xs text-muted-foreground cursor-pointer flex items-center gap-1">
                <Bug className="h-3 w-3" /> Technical Details
              </summary>
              <pre className="mt-2 p-3 bg-muted rounded-lg text-xs overflow-auto max-h-32 text-muted-foreground">
                {this.state.error.message}
                {this.state.errorInfo?.componentStack?.slice(0, 500)}
              </pre>
            </details>
          )}
          <div className="flex gap-3">
            <Button variant="outline" onClick={this.handleReset}>
              <RefreshCw className="h-4 w-4 mr-2" />Try Again
            </Button>
            <Button onClick={() => { this.handleReset(); window.location.href = "/"; }}>
              <Home className="h-4 w-4 mr-2" />Return to Dashboard
            </Button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
