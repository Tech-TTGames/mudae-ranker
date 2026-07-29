import Swal from 'sweetalert2'

export function useAlerts() {
  // --- Passive Notifications (Toasts) ---
  const Toast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3000,
    timerProgressBar: true,
    didOpen: (toast) => {
      toast.addEventListener('mouseenter', Swal.stopTimer)
      toast.addEventListener('mouseleave', Swal.resumeTimer)
    }
  })

  const showSuccess = (message: string) => {
    Toast.fire({
      icon: 'success',
      title: message
    })
  }

  const showError = (message: string) => {
    Toast.fire({
      icon: 'error',
      title: message
    })
  }

  const showWarning = (message: string) => {
    Toast.fire({
      icon: 'warning',
      title: message
    })
  }

  // --- Active Dialogs (Modals) ---
  const confirmAction = async (message: string, title: string = 'Are you sure?'): Promise<boolean> => {
    const result = await Swal.fire({
      title: title,
      text: message,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33',
      confirmButtonText: 'Yes',
      cancelButtonText: 'Cancel'
    })
    return result.isConfirmed
  }

  const promptAction = async (message: string, title: string = 'Input Required'): Promise<string | null> => {
    const result = await Swal.fire({
      title: title,
      text: message,
      input: 'text',
      showCancelButton: true,
      confirmButtonColor: '#3085d6',
      cancelButtonColor: '#d33'
    })
    return result.isConfirmed ? result.value : null
  }

  return {
    showSuccess,
    showError,
    showWarning,
    confirmAction,
    promptAction
  }
}
