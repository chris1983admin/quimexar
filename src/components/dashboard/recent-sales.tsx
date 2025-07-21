import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar"

interface RecentSalesProps {
  data: {
    name: string;
    email: string;
    amount: string;
    avatar: string;
  }[];
}

export function RecentSales({ data }: RecentSalesProps) {
  if (!data || data.length === 0) {
    return (
        <div className="flex items-center justify-center h-40">
            <p className="text-sm text-muted-foreground">No hay ventas recientes.</p>
        </div>
    )
  }
  
  return (
    <div className="space-y-8">
      {data.map((sale, index) => (
        <div className="flex items-center" key={index}>
          <Avatar className="h-9 w-9">
            <AvatarImage src={`https://i.pravatar.cc/40?u=${sale.email}`} alt="Avatar" />
            <AvatarFallback>{sale.avatar}</AvatarFallback>
          </Avatar>
          <div className="ml-4 space-y-1">
            <p className="text-sm font-medium leading-none">{sale.name}</p>
            <p className="text-sm text-muted-foreground">{sale.email}</p>
          </div>
          <div className="ml-auto font-medium">{sale.amount}</div>
        </div>
      ))}
    </div>
  )
}
