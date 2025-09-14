'use client';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  X, 
  AlertCircle, 
  Network, 
  Shield, 
  Database, 
  Server, 
  Clock, 
  FileQuestion,
  Zap
} from 'lucide-react';

interface GuidanceModalProps {
  isVisible: boolean;
  reason: string;
  guidance: string;
  errorAnalysis?: {
    totalErrors?: number;
    categories?: string[];
  } | null;
  onClose: () => void;
}

export function GuidanceModal({
  isVisible,
  reason,
  guidance,
  errorAnalysis,
  onClose,
}: GuidanceModalProps) {

  const getReasonIcon = (reasonType: string) => {
    switch (reasonType) {
      case 'network_issues':
        return <Network className="h-5 w-5 text-blue-600" />;
      case 'authentication_failures':
        return <Shield className="h-5 w-5 text-red-600" />;
      case 'infrastructure_down':
        return <Server className="h-5 w-5 text-orange-600" />;
      case 'data_issues':
        return <Database className="h-5 w-5 text-purple-600" />;
      case 'complex_issue':
        return <FileQuestion className="h-5 w-5 text-gray-600" />;
      case 'markdown_not_available':
        return <FileQuestion className="h-5 w-5 text-yellow-600" />;
      case 'api_error':
        return <Zap className="h-5 w-5 text-red-500" />;
      default:
        return <AlertCircle className="h-5 w-5 text-gray-600" />;
    }
  };

  const getReasonTitle = (reasonType: string) => {
    switch (reasonType) {
      case 'network_issues':
        return 'Network Connectivity Issue';
      case 'authentication_failures':
        return 'Authentication Problem';
      case 'infrastructure_down':
        return 'Infrastructure Unavailable';
      case 'data_issues':
        return 'Test Data Problem';
      case 'complex_issue':
        return 'Complex Issue Detected';
      case 'markdown_not_available':
        return 'Report Analysis Issue';
      case 'api_error':
        return 'Service Temporarily Unavailable';
      default:
        return 'Manual Investigation Required';
    }
  };

  const getReasonBadge = (reasonType: string) => {
    switch (reasonType) {
      case 'network_issues':
      case 'infrastructure_down':
        return <Badge variant="destructive" className="bg-red-100 text-red-800 border-red-200">Critical</Badge>;
      case 'authentication_failures':
      case 'data_issues':
        return <Badge variant="outline" className="bg-orange-100 text-orange-800 border-orange-200">High Priority</Badge>;
      case 'complex_issue':
      case 'markdown_not_available':
        return <Badge variant="outline" className="bg-yellow-100 text-yellow-800 border-yellow-200">Investigation Needed</Badge>;
      case 'api_error':
        return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200">Temporary</Badge>;
      default:
        return <Badge variant="outline" className="bg-gray-100 text-gray-800 border-gray-200">Manual Review</Badge>;
    }
  };

  const formatGuidanceText = (text: string) => {
    // Convert markdown-style formatting to JSX
    return text.split('\n').map((line, index) => {
      // Handle headers
      if (line.startsWith('**') && line.endsWith('**')) {
        const content = line.slice(2, -2);
        return (
          <h4 key={index} className="font-semibold text-gray-900 mt-4 mb-2 first:mt-0">
            {content}
          </h4>
        );
      }
      
      // Handle bullet points
      if (line.startsWith('• ')) {
        return (
          <li key={index} className="ml-4 text-gray-700 mb-1">
            {line.slice(2)}
          </li>
        );
      }
      
      // Handle emoji lines (like 🌐, 🔐, etc.)
      if (line.match(/^[🌐🔐🏗️📊🔍📄⚡📋]/)) {
        return (
          <div key={index} className="font-medium text-gray-800 mt-3 mb-2">
            {line}
          </div>
        );
      }
      
      // Handle bold text inline
      if (line.includes('**')) {
        const parts = line.split('**');
        return (
          <p key={index} className="text-gray-700 mb-2">
            {parts.map((part, partIndex) => 
              partIndex % 2 === 1 ? 
                <strong key={partIndex} className="font-semibold">{part}</strong> : 
                part
            )}
          </p>
        );
      }
      
      // Handle empty lines
      if (line.trim() === '') {
        return <div key={index} className="mb-2" />;
      }
      
      // Regular text
      return (
        <p key={index} className="text-gray-700 mb-2">
          {line}
        </p>
      );
    });
  };

  if (!isVisible) {
    return null;
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <Card className="w-full max-w-2xl max-h-[80vh] overflow-y-auto shadow-xl">
        <CardHeader className="pb-4">
          <div className="flex items-start justify-between">
            <div className="flex items-start gap-3">
              {getReasonIcon(reason)}
              <div>
                <CardTitle className="text-xl font-semibold text-gray-900 mb-2">
                  {getReasonTitle(reason)}
                </CardTitle>
                {getReasonBadge(reason)}
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 -mr-2 -mt-2"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>

        <CardContent className="space-y-6">
          {/* Error Analysis Summary */}
          {errorAnalysis && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h5 className="font-medium text-gray-900 mb-2">Analysis Summary</h5>
              <div className="flex items-center gap-4 text-sm text-gray-600">
                {errorAnalysis.totalErrors && (
                  <span>
                    <strong>{errorAnalysis.totalErrors}</strong> issue{errorAnalysis.totalErrors > 1 ? 's' : ''} detected
                  </span>
                )}
                {errorAnalysis.categories && errorAnalysis.categories.length > 0 && (
                  <span>
                    Categories: <strong>{errorAnalysis.categories.join(', ')}</strong>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Professional Guidance */}
          <div className="prose prose-sm max-w-none">
            <div className="space-y-2">
              {formatGuidanceText(guidance)}
            </div>
          </div>

          {/* Additional Context based on reason */}
          {reason === 'complex_issue' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <AlertCircle className="h-5 w-5 text-blue-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-blue-900 mb-1">Pro Tip</p>
                  <p className="text-blue-800">
                    Consider breaking complex test scenarios into smaller, more focused tests. 
                    This makes debugging easier and improves test reliability.
                  </p>
                </div>
              </div>
            </div>
          )}

          {reason === 'api_error' && (
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <div className="flex items-start gap-2">
                <Clock className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-900 mb-1">Temporary Issue</p>
                  <p className="text-yellow-800">
                    AI services occasionally experience high demand. Most issues resolve within a few minutes.
                  </p>
                </div>
              </div>
            </div>
          )}
        </CardContent>

        {/* Footer Actions */}
        <div className="border-t border-gray-100 px-6 py-4 bg-gray-50">
          <div className="flex justify-end">
            <Button 
              onClick={onClose}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6"
            >
              Continue
            </Button>
          </div>
        </div>
      </Card>
    </div>
  );
}