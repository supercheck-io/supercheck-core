"use client";

import { useEffect, useState } from 'react';
import { useProjectContext } from '@/hooks/use-project-context';

export function SetupChecker() {
  const [isSetupComplete, setIsSetupComplete] = useState(false);
  const { refreshProjects } = useProjectContext();

  useEffect(() => {
    const checkAndSetupDefaults = async () => {
      try {
        // Check if user has active project
        const response = await fetch('/api/projects');
        const data = await response.json();
        
        if (!data.success || data.data.length === 0) {
          // User has no projects, try to set up defaults
          console.log('No projects found, setting up defaults...');
          
          const setupResponse = await fetch('/api/auth/setup-defaults', {
            method: 'POST',
          });
          
          if (setupResponse.ok) {
            console.log('✅ Default organization and project created');
            
            // Refresh projects in the context to get the new project
            await refreshProjects();
          } else {
            console.log('Setup not needed or failed, user likely already has org/project');
          }
        }
        
        setIsSetupComplete(true);
      } catch (error) {
        console.log('Setup check failed:', error);
        setIsSetupComplete(true);
      }
    };

    // Only run setup check if not already complete
    if (!isSetupComplete) {
      // Run check after a short delay to ensure auth is fully loaded
      const timer = setTimeout(checkAndSetupDefaults, 1000);
      return () => clearTimeout(timer);
    }
  }, [isSetupComplete, refreshProjects]);

  return null; // This component doesn't render anything
}