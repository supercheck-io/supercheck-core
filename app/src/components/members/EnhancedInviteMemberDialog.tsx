'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { UserPlus, Mail, Building, FolderOpen, Shield } from 'lucide-react';
import { toast } from 'sonner';
import { inviteMemberSchema } from '@/lib/validations/member';
import { z } from 'zod';

interface Project {
  id: string;
  name: string;
  description?: string;
}

interface ProjectRoleAssignment {
  projectId: string;
  role: 'project_viewer' | 'project_editor' | 'project_admin' | 'org_admin' | 'org_owner';
}

interface EnhancedInviteMemberDialogProps {
  projects: Project[];
  onInvite: (invitation: {
    email: string;
    organizationRole: string;
    projectAssignments: ProjectRoleAssignment[];
  }) => Promise<void>;
  isLoading?: boolean;
}

const organizationRoles = [
  { value: 'project_viewer', label: 'Project Viewer', description: 'Read-only access to organization projects' },
  { value: 'project_editor', label: 'Project Editor', description: 'Create and edit tests, jobs, monitors in assigned projects' },
  { value: 'project_admin', label: 'Project Admin', description: 'Full admin access to assigned projects only' },
  { value: 'org_admin', label: 'Organization Admin', description: 'Can manage organization and invite members' }
];

const projectRoles = [
  { value: 'project_viewer', label: 'Project Viewer', description: 'Read-only access to project' },
  { value: 'project_editor', label: 'Project Editor', description: 'Create and edit tests, jobs, monitors' },
  { value: 'project_admin', label: 'Project Admin', description: 'Full admin access to project' },
  { value: 'org_admin', label: 'Organization Admin', description: 'Manage organization and projects' },
  { value: 'org_owner', label: 'Organization Owner', description: 'Full organization and project control' }
];

export function EnhancedInviteMemberDialog({ 
  projects, 
  onInvite, 
  isLoading = false 
}: EnhancedInviteMemberDialogProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [organizationRole, setOrganizationRole] = useState<string>('project_editor');
  const [projectAssignments, setProjectAssignments] = useState<ProjectRoleAssignment[]>([]);

  // Initialize with all projects as "project_viewer" by default
  useEffect(() => {
    if (projects.length > 0 && projectAssignments.length === 0) {
      setProjectAssignments(
        projects.map(project => ({
          projectId: project.id,
          role: 'project_viewer' as const
        }))
      );
    }
  }, [projects, projectAssignments.length]);

  const handleProjectRoleChange = (projectId: string, role: string) => {
    setProjectAssignments(prev => 
      prev.map(assignment => 
        assignment.projectId === projectId 
          ? { ...assignment, role: role as ProjectRoleAssignment['role'] }
          : assignment
      )
    );
  };

  const handleRemoveProject = (projectId: string) => {
    setProjectAssignments(prev => 
      prev.filter(assignment => assignment.projectId !== projectId)
    );
  };

  const handleAddProject = (projectId: string) => {
    if (!projectAssignments.find(a => a.projectId === projectId)) {
      setProjectAssignments(prev => [
        ...prev,
        { projectId, role: 'project_viewer' }
      ]);
    }
  };

  const handleBulkRoleChange = (role: string) => {
    setProjectAssignments(prev => 
      prev.map(assignment => ({ 
        ...assignment, 
        role: role as ProjectRoleAssignment['role'] 
      }))
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Prepare data for validation
    const inviteDataToValidate = {
      email: email.trim(),
      role: organizationRole,
      selectedProjects: projectAssignments.map(assignment => assignment.projectId)
    };

    // Validate form data using Zod
    try {
      inviteMemberSchema.parse(inviteDataToValidate);
    } catch (error) {
      if (error instanceof z.ZodError) {
        if (error.errors && error.errors.length > 0) {
          toast.error(error.errors[0].message);
          return;
        }
      }
      toast.error('Please fix the form errors');
      return;
    }

    try {
      await onInvite({
        email: inviteDataToValidate.email,
        organizationRole,
        projectAssignments
      });
      
      // Reset form
      setEmail('');
      setOrganizationRole('project_editor');
      setProjectAssignments(
        projects.map(project => ({
          projectId: project.id,
          role: 'project_viewer' as const
        }))
      );
      setOpen(false);
      toast.success('Invitation sent successfully');
    } catch {
      toast.error('Failed to send invitation');
    }
  };

  const assignedProjects = projects.filter(project => 
    projectAssignments.some(assignment => assignment.projectId === project.id)
  );

  const unassignedProjects = projects.filter(project => 
    !projectAssignments.some(assignment => assignment.projectId === project.id)
  );

  const selectedOrgRole = organizationRoles.find(role => role.value === organizationRole);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>
          <UserPlus className="w-4 h-4 mr-2" />
          Invite Member
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Invite New Member
          </DialogTitle>
        </DialogHeader>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Email Input */}
          <div className="space-y-2">
            <Label htmlFor="email" className="flex items-center gap-2">
              <Mail className="w-4 h-4" />
              Email Address
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="user@example.com"
              required
            />
          </div>

          {/* Organization Role */}
          <div className="space-y-2">
            <Label className="flex items-center gap-2">
              <Building className="w-4 h-4" />
              Organization Role
            </Label>
            <Select value={organizationRole} onValueChange={setOrganizationRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {organizationRoles.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    <div className="flex flex-col text-left">
                      <span className="font-medium">{role.label}</span>
                      <span className="text-sm text-muted-foreground">{role.description}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedOrgRole && (
              <p className="text-sm text-muted-foreground">
                {selectedOrgRole.description}
              </p>
            )}
          </div>

          <Separator />

          {/* Project Assignments */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-2">
                <FolderOpen className="w-4 h-4" />
                Project Access ({projectAssignments.length} of {projects.length} projects)
              </Label>
              <div className="flex gap-2">
                <Select onValueChange={handleBulkRoleChange}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Set all to..." />
                  </SelectTrigger>
                  <SelectContent>
                    {projectRoles.map((role) => (
                      <SelectItem key={role.value} value={role.value}>
                        <span className="text-left">{role.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Assigned Projects */}
            {assignedProjects.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Assigned Projects</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {assignedProjects.map((project) => {
                    const assignment = projectAssignments.find(a => a.projectId === project.id);
                    const roleInfo = projectRoles.find(r => r.value === assignment?.role);
                    
                    return (
                      <div key={project.id} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-medium">{project.name}</span>
                            <Badge variant="secondary" className="flex items-center gap-1">
                              <Shield className="w-3 h-3" />
                              {roleInfo?.label}
                            </Badge>
                          </div>
                          {project.description && (
                            <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
                          )}
                          {roleInfo && (
                            <p className="text-xs text-muted-foreground mt-1">{roleInfo.description}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Select 
                            value={assignment?.role} 
                            onValueChange={(role) => handleProjectRoleChange(project.id, role)}
                          >
                            <SelectTrigger className="w-32">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {projectRoles.map((role) => (
                                <SelectItem key={role.value} value={role.value}>
                                  <span className="text-left">{role.label}</span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => handleRemoveProject(project.id)}
                          >
                            Remove
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </CardContent>
              </Card>
            )}

            {/* Unassigned Projects */}
            {unassignedProjects.length > 0 && (
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium">Available Projects</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {unassignedProjects.map((project) => (
                    <div key={project.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <span className="font-medium">{project.name}</span>
                        {project.description && (
                          <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
                        )}
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddProject(project.id)}
                      >
                        Add
                      </Button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

            {projectAssignments.length === 0 && (
              <div className="text-center py-8 text-muted-foreground">
                <FolderOpen className="w-12 h-12 mx-auto mb-4 opacity-50" />
                <p>No projects assigned. Add at least one project to continue.</p>
              </div>
            )}
          </div>

          {/* Submit Button */}
          <div className="flex justify-end gap-2 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isLoading || !email || projectAssignments.length === 0}
            >
              {isLoading ? 'Sending...' : `Send Invitation`}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}