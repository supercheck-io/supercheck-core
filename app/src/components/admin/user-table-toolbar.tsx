import type { Table } from "@tanstack/react-table";
import { X, Search, UserPlus, Crown, Shield, User, UserCheck, UserX, CheckCircle, XCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTableViewOptions } from "@/components/tests/data-table-view-options";
import { DataTableFacetedFilter } from "@/components/tests/data-table-faceted-filter";

import { userRoles, userStatuses, emailVerificationStatus } from "./user-data";

interface UserTableToolbarProps<TData> {
  table: Table<TData>;
  onCreateUser?: () => void;
}

export function UserTableToolbar<TData>({
  table,
  onCreateUser,
}: UserTableToolbarProps<TData>) {
  const isFiltered = table.getState().columnFilters.length > 0;

  // Get faceted unique values for roles from the table
  const roleColumn = table.getColumn("role");
  const roleFacets = roleColumn?.getFacetedUniqueValues();
  
  // Create role filter options from faceted values with proper icons
  const getRoleIcon = (role: string) => {
    if (!role || typeof role !== 'string') return User;
    switch (role) {
      case 'super_admin': return Crown;
      case 'admin': return Shield;
      default: return User;
    }
  };
  
  const getRoleColor = (role: string) => {
    if (!role || typeof role !== 'string') return 'text-gray-600';
    switch (role) {
      case 'super_admin': return 'text-purple-600';
      case 'admin': return 'text-blue-600';
      default: return 'text-gray-600';
    }
  };
  
  const availableRoles = roleFacets ? 
    Array.from(roleFacets.keys())
      .filter(roleValue => roleValue != null)
      .map(roleValue => ({
        value: roleValue as string,
        label: roleValue === 'super_admin' ? 'Super Admin' : (roleValue as string).charAt(0).toUpperCase() + (roleValue as string).slice(1),
        icon: getRoleIcon(roleValue as string),
        color: getRoleColor(roleValue as string),
      })) : 
    userRoles;

  // Get faceted unique values for banned status from the table
  const bannedColumn = table.getColumn("banned");
  const bannedFacets = bannedColumn?.getFacetedUniqueValues();
  
  // Create status filter options from faceted values
  const availableStatuses = bannedFacets ? 
    Array.from(bannedFacets.keys())
      .filter(statusValue => statusValue != null)
      .map(statusValue => {
        const status = statusValue as string;
        const isBanned = status === 'banned';
        return {
          value: status,
          label: isBanned ? 'Banned' : 'Active',
          icon: isBanned ? UserX : UserCheck,
          color: isBanned ? 'text-red-600' : 'text-green-600',
        };
      }) : 
    userStatuses;

  // Get faceted unique values for email verification from the table
  const emailVerifiedColumn = table.getColumn("emailVerified");
  const emailVerifiedFacets = emailVerifiedColumn?.getFacetedUniqueValues();
  
  // Create email status filter options from faceted values
  const availableEmailStatuses = emailVerifiedFacets ? 
    Array.from(emailVerifiedFacets.keys())
      .filter(statusValue => statusValue != null)
      .map(statusValue => {
        const status = statusValue as string;
        const isVerified = status === 'verified';
        return {
          value: status,
          label: isVerified ? 'Verified' : 'Unverified',
          icon: isVerified ? CheckCircle : XCircle,
          color: isVerified ? 'text-green-600' : 'text-yellow-600',
        };
      }) : 
    emailVerificationStatus;

  return (
    <div className="flex items-center justify-between">
      <div className="flex flex-1 items-center space-x-2">
        <div className="relative">
          <Search className="absolute left-2 top-2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search users..."
            value={(table.getState().globalFilter as string) ?? ""}
            onChange={(event) => table.setGlobalFilter(event.target.value)}
            className="h-8 w-[250px] pr-8 pl-8"
          />
          {(table.getState().globalFilter as string)?.length > 0 && (
            <button
              type="reset"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-red-500 rounded-sm bg-red-200 p-0.5"
              onClick={() => table.setGlobalFilter("")}
              tabIndex={0}
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {table.getColumn("role") && (
          <DataTableFacetedFilter
            column={table.getColumn("role")}
            title="Role"
            options={availableRoles}
          />
        )}
        {table.getColumn("banned") && (
          <DataTableFacetedFilter
            column={table.getColumn("banned")}
            title="Status"
            options={availableStatuses}
          />
        )}
        {table.getColumn("emailVerified") && (
          <DataTableFacetedFilter
            column={table.getColumn("emailVerified")}
            title="Email Status"
            options={availableEmailStatuses}
          />
        )}
        {isFiltered && (
          <Button
            variant="ghost"
            onClick={() => table.resetColumnFilters()}
            className="h-8 px-2 lg:px-3"
          >
            Reset
            <X className="ml-2 h-4 w-4" />
          </Button>
        )}
      </div>
      <div className="flex items-center space-x-2">
      <DataTableViewOptions table={table} />
        {onCreateUser && (
          <Button size="sm" onClick={onCreateUser}>
            <UserPlus className="h-4 w-4 mr-2" />
            Create User
          </Button>
        )}
        
      </div>
    </div>
  );
}